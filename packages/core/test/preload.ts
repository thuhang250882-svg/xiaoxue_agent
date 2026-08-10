import path from "path"

process.env.OPENCODE_DB = ":memory:"
process.env.OPENCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.OPENCODE_DISABLE_MODELS_FETCH = "true"
process.env.XIAOXUE_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
