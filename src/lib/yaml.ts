import {
  CORE_SCHEMA,
  binaryTag,
  legacyMapTag,
  mergeTag,
  omapTag,
  pairsTag,
  setTag,
  timestampTag,
} from "js-yaml";

// Retain the YAML 1.2 scalar rules and explicit tags accepted by js-yaml 4.
export const YAML_COMPAT_SCHEMA = CORE_SCHEMA.withTags(
  binaryTag,
  legacyMapTag,
  mergeTag,
  omapTag,
  pairsTag,
  setTag,
  timestampTag
);
