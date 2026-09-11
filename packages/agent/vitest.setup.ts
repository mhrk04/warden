// Hard safety net: tests must NEVER hit the real LLM/network. Strip any ambient
// LLM key so an accidental no-key `explain()` call takes the deterministic
// template path instead of calling Gemini. Tests that exercise the LLM path
// inject their own fetch + apiKey explicitly.
delete process.env.LLM_API_KEY;
