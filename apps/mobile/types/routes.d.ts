// apps/mobile/types/routes.d.ts

declare module "expo-router" {
  interface MappableParams {
    "/(broker)/scan-result": {
      imageUri: string;
      imageBase64: string;
      mimeType: "image/jpeg" | "image/png";
      propertyId: string;
      propertyLabel: string;
    };
  }
}
