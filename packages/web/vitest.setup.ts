// Hard safety net for the web API unit tests: they must NEVER hit the real
// network (World verify endpoint, Sepolia RPC, the subgraph, or the LLM). Strip
// ambient secrets so an accidental un-mocked call cannot reach a live service.
// Tests that exercise these paths inject their own mocked implementations.
delete process.env.LLM_API_KEY;
delete process.env.WORLD_APP_ID;
delete process.env.SEPOLIA_RPC_URL;
delete process.env.DEPLOYER_PRIVATE_KEY;
delete process.env.SUBGRAPH_URL;
delete process.env.THEGRAPH_API_KEY;

// Deterministic session secret so signed-cookie round-trips are stable in tests.
process.env.SESSION_SECRET = "test-session-secret-do-not-use-in-prod";
