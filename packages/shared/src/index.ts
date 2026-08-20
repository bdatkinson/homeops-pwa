// Shared types, enums, and utility functions for HomeOps monorepo

export interface Appliance {
  id: string;
  property_id: string;
  appliance_type: string;
  make: string;
  model: string;
  model_normalized?: string;
  serial?: string;
  estimated_year?: number;
  recall_status?: 'none' | 'active' | 'resolved' | 'unknown';
  cpsc_recall_ids?: string[];
}

export interface Property {
  id: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface Passport {
  id: string;
  property_id: string;
  created_by: string; // profile_id of the broker/PM
  status: 'draft' | 'sent' | 'activated' | 'expired';
  brand_agent_name?: string;
  brand_brokerage?: string;
  appliances: Appliance[]; // populated when fetching a passport
}

// Add other shared types as needed
