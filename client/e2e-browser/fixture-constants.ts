/**
 * Test constants shared by make-fixture.mts and routes.spec.ts. They are not secrets and guard
 * nothing real; they live here, not in fixtures/vault.json, which holds only what a server would.
 */
export const FIXTURE_EMAIL = 'm.hale@fastmail.com';
export const FIXTURE_PASSWORD = 'lantern-orchard-9';
/** The public link's AES key is SHA-256 of this seed. */
export const FIXTURE_LINK_KEY_SEED = 'crypticstorage-browser-smoke-link-key';
