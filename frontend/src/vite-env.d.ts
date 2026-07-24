/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the RestaurantOS API, e.g. https://restaurant-os-api.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
