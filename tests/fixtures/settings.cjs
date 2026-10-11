/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
// The SQL seed is the reference; tests do not maintain another set of defaults.
const sql = fs.readFileSync(path.join(__dirname, "../../db/seed.sql"), "utf8");
const values = Object.fromEntries([...sql.matchAll(/\('([a-z_]+)', '((?:[^']|'')*)'::jsonb\)/g)].map(([, key, value]) => [key, JSON.parse(value.replaceAll("''", "'"))]));
function appDefaults() { return structuredClone({ heroSlides: values.hero_slides, deliveryHours: values.delivery_hours, pricingPolicy: values.pricing_policy, nutrition: values.nutrition, optionKcal: values.option_kcal, ingredientEmojis: values.ingredient_emojis, catalogConfig: values.catalog_config, updatedAt: "2026-10-01T00:00:00.000Z" }); }
const withDefaults = snapshot => ({ ...snapshot, defaults: snapshot.defaults ?? appDefaults() });
module.exports = { appDefaults, withDefaults };
