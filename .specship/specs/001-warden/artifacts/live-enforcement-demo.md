# WARDEN — Live Enforcement Demo (Sepolia)

Proven on Ethereum Sepolia against the deployed Guard `0xfa12529ED63660dD396733C172267244c351C64a`.
Demo agents: `demo.warden.eth` (healthy), `expiring.warden.eth` (short expiry).
Recipient (allowlisted): `0x70D26bDe8C7a1F2A0B0dA171bcfB4500AfA91E9D`. Caps: perTx 100 tUSDC, cumulative 250 tUSDC.

| # | Case | Input | Result |
|---|------|-------|--------|
| 1 | Valid payout | 50 tUSDC, allowlisted, in-scope | EXECUTED (tx status 0x1) |
| 2 | Overspend | 200 tUSDC (> per-tx cap 100) | REJECTED GuardRejected(reason=1 limit_pertx) |
| 3 | Non-allowlisted recipient | 10 tUSDC to 0x…bEEF | REJECTED GuardRejected(reason=3 recipient) |
| 4 | Post-expiry | 10 tUSDC on expiring.warden.eth after expiry | REJECTED GuardRejected(reason=4 expired) |
| 5 | After revocation | revoke(demo) then 10 tUSDC | REJECTED GuardRejected(reason=5 revoked) |

The agent (signer) cannot move funds outside the human-set scope. Enforcement is on-chain; every rejection reverts with a typed reason and moves no funds. This is the core security claim, demonstrated live.

## Privy server-wallet signing (live)

The agent's proposing signer is a real Privy server wallet (@privy-io/server-auth), low-authority (only forwards a pre-built Guard.propose call). Proven live on Sepolia:
- Privy wallet 0xc6160A34E94F0b5210607a33C7D8DeCC9dc68000 (id uztos06op1ttjbimxd1ch2bu) configured as an agent's agentSigner.
- It signed Guard.propose(40 tUSDC) -> tx 0xba78b7e2ab8d0b10e85a8e20338792f9439f1af4b280a4943ba35a16beeb959d (success); the Guard enforced it and accrued spent to 40 tUSDC.
The Guard is signer-agnostic and re-enforces every rule on-chain regardless of signer.
