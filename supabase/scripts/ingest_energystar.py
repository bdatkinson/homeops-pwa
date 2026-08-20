#!/usr/bin/env python3
# Modified ingest_energystar.py for Supabase REST API insertion.

import csv, io, urllib.request, json, os, re
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

SUPABASE_REST_URL = f"{SUPABASE_URL}/rest/v1/model_registry"
HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates", # UPSERT behavior
    "User-Agent": "HomeOpsIngest/1.0",
}

SOCRATA_BASE = "https://data.energystar.gov/resource/{id}.csv?$limit=99999"

ENERGYSTAR_DATASETS = {
    "q8py-6w3f": "dishwasher",
    "p5st-her9": "refrigerator",
    "bghd-e2wd": "washer",
    "t9u7-4d2j": "dryer",
    "pbpq-swnu": "water_heater",
    "w7cv-9xjt": "hvac",
    "8t9c-g3tn": "freezer",
}

def normalize_model(model: str) -> str:
    return re.sub(r'[^A-Z0-9]', '', model.upper())

def infer_year(date_str: str) -> int | None:
    if not date_str:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).year
        except ValueError:
            continue
    return None

def ingest_category(appliance_type: str, dataset_id: str) -> dict:
    url = SOCRATA_BASE.format(id=dataset_id)
    print(f"Fetching {appliance_type} (dataset {dataset_id}) from {url}")

    req = urllib.request.Request(url, headers={"User-Agent": "HomeOpsIngest/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        csv_data = resp.read().decode("utf-8")

    reader = csv.DictReader(io.StringIO(csv_data))
    inserted_count = 0
    skipped_count = 0

    batch = []
    BATCH_SIZE = 500 # Supabase API recommendation

    for row in tqdm(reader, desc=f"Processing {appliance_type} records"):
        # Map EnergyStar CSV fields to model_registry columns
        make = row.get("brand_name") or row.get("brand") or "Unknown"
        model_number = row.get("model_number") or row.get("model")
        year_str = row.get("date_certified") or row.get("certification_date") or ""
        energy_star_id = row.get("energy_star_id") or row.get("id")

        if not model_number:
            skipped_count += 1
            continue

        model_normalized = normalize_model(model_number)
        manufacture_year = infer_year(year_str)

        # Skip if essential data is missing
        if not make or not model_number or not model_normalized:
            skipped_count += 1
            continue
            
        record = {
            "make": make,
            "model_number": model_number,
            "model_normalized": model_normalized,
            "appliance_type": appliance_type,
            "manufacture_year_min": manufacture_year,
            "manufacture_year_max": manufacture_year, # Assume single year for now
            "energy_star_id": energy_star_id,
            "source": "energystar",
        }
        batch.append(record)

        if len(batch) >= BATCH_SIZE:
            try:
                data = json.dumps(batch).encode("utf-8")
                req = urllib.request.Request(SUPABASE_REST_URL, data=data, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=60) as resp:
                    resp.read() # Consume response
                inserted_count += len(batch)
                batch = []
            except urllib.error.HTTPError as e:
                print(f"ERROR inserting batch: HTTP {e.code} - {e.read().decode()}")
                skipped_count += len(batch) # Treat as skipped if batch insert fails
                batch = []
            except Exception as e:
                print(f"ERROR inserting batch: {e}")
                skipped_count += len(batch)
                batch = []

    # Insert remaining items
    if batch:
        try:
            data = json.dumps(batch).encode("utf-8")
            req = urllib.request.Request(SUPABASE_REST_URL, data=data, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp.read()
            inserted_count += len(batch)
        except urllib.error.HTTPError as e:
            print(f"ERROR inserting final batch: HTTP {e.code} - {e.read().decode()}")
            skipped_count += len(batch)
        except Exception as e:
            print(f"ERROR inserting final batch: {e}")
            skipped_count += len(batch)

    print(f"  Inserted: {inserted_count}, Skipped: {skipped_count}")
    return {"inserted": inserted_count, "skipped": skipped_count}

def main():
    total_inserted = 0
    total_skipped = 0
    for dataset_id, appliance_type in ENERGYSTAR_DATASETS.items():
        results = ingest_category(appliance_type, dataset_id)
        total_inserted += results["inserted"]
        total_skipped += results["skipped"]
    print(f"\n--- Ingestion Summary ---")
    print(f"Total records inserted: {total_inserted}")
    print(f"Total records skipped: {total_skipped}")

if __name__ == "__main__":
    main()
