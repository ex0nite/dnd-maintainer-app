/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Label of the derived authentication address (<pseudo>@<label>.invalid); defaults to "table". */
  readonly VITE_ACCOUNT_DOMAIN?: string;
}
