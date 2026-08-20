#!/usr/bin/env python3
# Modified ingest_cpsc.py for Supabase REST API insertion.

import urllib.request, json, os, re
from datetime import datetime
from dotenv import load_dotenv
from tqdm import tqdm

# Load environment variables
load_dotenv()

# Supabase credentials from .hermes/.env
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in ~/.hermes/.env")

# Supabase API endpoints
MODEL_REGISTRY_URL = f"{SUPABASE_URL}/rest/v1/model_registry"
CPSC_RECALLS_URL = f"{SUPABASE_URL}/rest/v1/cpsc_recalls"
HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates", # UPSERT for model_registry
    "User-Agent": "HomeOpsIngest/1.0",
}

CPSC_API_URL = "https://www.saferproducts.gov/RestWebServices/Recall?format=json"

def normalize_model(model: str) -> str:
    return re.sub(r'[^A-Z0-9]', '', model.upper())

def fetch_recalls() -> list:
    print(f"Fetching CPSC recalls from {CPSC_API_URL}")
    req = urllib.request.Request(CPSC_API_URL, headers={"User-Agent": "HomeOpsIngest/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))

def ingest_cpsc_recalls(recalls: list):
    inserted_count = 0
    skipped_count = 0
    batch = []
    BATCH_SIZE = 500

    print(f"Ingesting {len(recalls)} CPSC recalls into Supabase...")

    for r in tqdm(recalls, desc="Processing CPSC recalls"):
        recall_id = str(r.get("RecallID"))
        product_type = r.get("ProductType")
        manufacturer = r.get("Manufacturer") or r.get("ManufacturerCountry") # Fallback
        model_numbers = []
        if r.get("Products"):
            for p in r["Products"]:
                model_numbers.extend([normalize_model(mn["Model"]) for mn in p.get("ModelNumbers", []) if mn.get("Model")])

        # Dedup and store unique normalized models per recall
        unique_models = list(set(model_numbers))

        record = {
            "id": recall_id,
            "product_type": product_type,
            "manufacturer": manufacturer,
            "model_numbers_normalized": unique_models, # Store normalized models
            "recall_date": r.get("RecallDate"),
            "url": r.get("URL"),
            "description": r.get("Description"),
            "hazard": r.get("Hazard"),
            "remedy": r.get("Remedy"),
            "upc": r.get("UPC"),
        }
        batch.append(record)

        if len(batch) >= BATCH_SIZE:
            try:
                data = json.dumps(batch).encode("utf-8")
                req = urllib.request.Request(CPSC_RECALLS_URL, data=data, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=60) as resp:
                    resp.read()
                inserted_count += len(batch)
                batch = []
            except urllib.error.HTTPError as e:
                print(f"ERROR inserting batch: HTTP {e.code} - {e.read().decode()}")
                skipped_count += len(batch)
                batch = []
            except Exception as e:
                print(f"ERROR inserting batch: {e}")
                skipped_count += len(batch)
                batch = []

    if batch:
        try:
            data = json.dumps(batch).encode("utf-8")
            req = urllib.request.Request(CPSC_RECALLS_URL, data=data, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp.read()
            inserted_count += len(batch)
        except urllib.error.HTTPError as e:
            print(f"ERROR inserting final batch: HTTP {e.code} - {e.read().decode()}")
            skipped_count += len(batch)
        except Exception as e:
            print(f"ERROR inserting final batch: {e}")
            skipped_count += len(batch)

    print(f"CPSC Recalls inserted: {inserted_count}, Skipped: {skipped_count}")
    return inserted_count

# Removed the async update_model_registry_with_cpsc_data for simplicity in this synchronous script.
# The gateway will handle linking recalls to models at lookup time.

def main():
    recalls = fetch_recalls()
    ingest_cpsc_recalls(recalls)

if __name__ == "__main__":
    main()
