# ETHDenver 2026 Prizes

A complete list of sponsors, prizes, and their descriptions.

## ETHDenver 2026

**Total Prize Pool:** $10,000 USD

### ETHERSPACE

**Prize:** $2,000 USD
**Number of winners:** 2

**Description:**

**User-owned Internet**

Built on Ethereum Showcase, Apps, Tokenomics, Art, Ownership Legal Structures, Wallets & Identity, Main Stream Adoption, Social Media & Content, NFTs

---

### Devtopia

**Prize:** $2,000 USD
**Number of winners:** 2

**Description:**

**Infrastructure**

Core Infra, L2s, Dev Tooling, Security, Scaling, zk (Scaling), Research Breakthroughs

---

### New France Village

**Prize:** $2,000 USD
**Number of winners:** 2

**Description:**

**THE Future of finance**

DeFi, TradFi, Stables, Policy, Regs, Compliance/AML, RWA, RealFi, Treasury Cos, Institutional ETH, Exchanges, Main Street Adoption, Wall Street Adoption

---

### Futurllama

**Prize:** $2,000 USD
**Number of winners:** 2

**Description:**

**Futooooooor Tech and Trends**

AI, DePIN, Unexpected, New Primitives, Big Crazy Ideas, Frontier Tech, Next Gen UI/UX/Usability

---

### Prosperia

**Prize:** $2,000 USD
**Number of winners:** 2

**Description:**

**Cypherpunks, Solarpunks & Communities**

Cypherpunks, Solarpunks & CommunitiesPrivacy, Cypherpunks, Solarpunks, Public Goods, zk (Privacy), Governance, DAOs, Ethereum for Good, Marketing/Community Building

---


## Hedera

**Total Prize Pool:** $25,000 USD

### On-Chain Automation with Hedera Schedule Service

**Prize:** $5,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Build a self-running application that uses Hedera Schedule Service System Contracts to execute future actions without relying on off chain servers. Focus on DeFi automation or business finance flows.

### 🗂️ Bounty Category

Feature Usage

### 💰 Prize Amount

5000

### 🥇 Number of Projects Awarded

2

### 🏆 Winner Breakdown

1st Place gets $3,000.
2nd Place gets $2,000.

### 📝 Requirements

 A working app on Hedera Testnet that creates and executes scheduled transactions as part of the core product.
- Scheduling must be initiated from a smart contract (i.e., contract-driven scheduling), not only from a backend script.
- Deliverables: public repo, live demo URL or runnable CLI/Docker, <3 min demo video, and README with setup + walkthrough.

### ✅ What does a successful project look like?

- Schedules are created deterministically from contract logic with clear authorization rules.
- Safe handling of edge cases: insufficient balance, expired schedules, partial execution, retries.
- Observability: schedule status tracking + user-readable history.

*Example of a successful implementation*
A “Token Vesting Vault” where a contract creates schedules for monthly unlocks to many recipients. The demo shows schedule creation, monitoring, execution, and a clean failure path with remediation.

### 🎨 UI/UX Design Requirements

Must include a usable interface: browser dApp or CLI. UI must show schedule lifecycle: created → pending → executed/failed with transaction links.

### 🧑‍⚖️ How are we judging it?

- Innovation: How new is the idea?
- Feasibility: How feasible is the idea?
- Execution: How well did the team develop / build the idea?
- Integration: How well does the idea / solution use Hedera etc.?
-Validation: What does the market think of the idea / solution?
- Success: Does the idea impact Hedera’s success metrics: accounts, active accounts, TPS etc.?
- Pitch: How well is the idea / solution presented / sold by the team?

### 🌎 Impact on the organization

Proves Hedera can run automation without off-chain logic and enable innovative use-cases that drive transactions, active accounts, and repeatable high-TPS flows.

### 📚 Resources

- <https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-smart-contracts/hedera-schedule-service>
- <https://github.com/hedera-dev/tutorial-hss-rebalancer-capacity-aware>
- <https://github.com/hashgraph/hedera-smart-contracts/tree/main/contracts/system-contracts/hedera-schedule-service>
- <https://portal.hedera.com/>

### 👀 Some example use cases

 Liquidation triggers for lending protocols (no keepers)
- Bond/coupon payments for tokenized securities
- Global payroll runs with scheduled disbursements
- Automated token unlocks for teams/investors/airdrops

### 💼 Recruitment Opportunities

Work for Hashgraph - https://www.hashgraph.com/careers/
Incubator Programmes in April and November

---

### Killer App for the Agentic Society (OpenClaw)

**Prize:** $10,000 USD
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


An agent-native application designed for a society of OpenClaw agents, where commerce, coordination, or value exchange happens autonomously. Bonus points if you use UCP to standardise agent-to-agent commerce.

### 🗂️ Bounty Category

Feature Usage

### 💰 Prize Amount

10000

### 🥇 Number of Projects Awarded

1

### 🏆 Winner Breakdown

1st Place gets $10.000

### 📝 Requirements

 App must be agent-first (OpenClaw agents are primary users)
- App must demonstrate autonomous or semi-autonomous agent behaviour
- App must create clear value in a multi-agent environment
- Agents must use other the Hedera EVM, Token Service, or Consensus Service
- Deliverables: public repo, live demo URL or runnable CLI/Docker, <3 min demo video, and README with setup + walkthrough.

### ✅ What does a successful project look like?

 An app which gets more valuable as more agents join
- Agents being able to discover, rank, and trade with each other using Hedera tokens
- Something which a human wouldn’t operate
- Hedera technology enables an actual value add to the society through increased trust (whether it be payment settlement, proof of ownership, HCS for attestation)


*Example of a successful implementation*
An agent participates in a prediction market about agent behaviour e.g. “Will agent X complete task Y by time Z?” or “Will agent class A outperform class B this week?”. It discovers a market, evaluates probabilities, places a trade using Hedera HTS tokens, and receives automated settlement based on on-chain attestations of agent actions.

### 🎨 UI/UX Design Requirements

The UI is for humans observing agents, but the product is not meant to be human-operated. SHould include an interface that shows the agent flow steps and states. Browser demo URL preferred. Reputation / trust indicators (maybe using ERC-8004) are nice to have.

### 🧑‍⚖️ How are we judging it?

- Innovation: How new is the idea?
- Feasibility: How feasible is the idea?
- Execution: How well did the team develop / build the idea?
- Integration: How well does the idea / solution use Hedera etc.?
- Validation: What does the market think of the idea / solution?
- Success: Does the idea impact Hedera’s success metrics: accounts, active accounts, TPS etc.?
- Pitch: How well is the idea / solution presented / sold by the team?

### 🌎 Impact on the organization

Positions Hedera as foundational infrastructure for the Agentic Society by enabling trust, coordination, and value exchange between autonomous agents throughl HTS usage, on-chain attestations, and repeat agent-initiated transactions as agent-native applications emerge.

### 📚 Resources

Resource Links
- <https://docs.openclaw.ai/start/getting-started>
- <https://docs.hedera.com/>
- <https://github.com/erc-8004>
- <https://github.com/hedera-dev/tutorial-ucp-hedera>
- <https://github.com/hedera-dev/hedera-agent-skills>
- <https://portal.hedera.com>

### 👀 Some example use cases

- Agents hiring other agents
- Agents pooling capital
- Agents competing for tasks
- Agents subscribing to other agents’ outputs
- Agent DAOs / guilds / collectives / cults

### 💼 Recruitment Opportunities

Work for Hashgraph - https://www.hashgraph.com/careers/
Incubator Programmes in April and November

---

### “No Solidity Allowed” - Hedera SDKs Only

**Prize:** $5,000 USD
**Number of winners:** 3
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Build a real application on Hedera using only Hedera SDKs (no Solidity, no EVM smart contracts). Use native Hedera services (Hedera Token Service, Hedera Consensus Service, etc.) to ship a working product. Can also use tools like n8n.

### 🗂️ Bounty Category

Feature Usage

### 💰 Prize Amount

5000

### 🥇 Number of Projects Awarded

3

### 🏆 Winner Breakdown

1st Place gets $2,500.
2nd Place gets $1,500.
3rd Place gets $1,000

### 📝 Requirements

 A working Testnet application built using primarily Hedera SDKs.
- Must use at least two Hedera native capabilities (e.g., HTS + HCS, or HTS + account features).
- Deliverables: public repo, live demo URL or runnable CLI/Docker, <3 min demo video, README.

### ✅ What does a successful project look like?

 A coherent end-to-end user journey (not a “hello world”).
- Strong integration with Hedera primitives (tokens, topics, transfers, metadata, etc.).
- Clear security model: key handling, permissions, least privilege, sensible custody.
- Optional: multi-user support, audit trail via HCS, token gating, integrations.

*Example of a successful implementation*
A “Receipts + Loyalty” app: users pay with an HTS token, the receipt is committed to HCS, and merchants issue loyalty points via HTS. Demo includes verification and transaction links.

### 🎨 UI/UX Design Requirements

Functional UI: browser dApp (public demo URL) or CLI. Must include basic onboarding, clear calls-to-action, and links to HashScan for key transactions.

### 🧑‍⚖️ How are we judging it?

- Innovation: How new is the idea?
- Feasibility: How feasible is the idea?
- Execution: How well did the team develop / build the idea?
- Integration: How well does the idea / solution use Hedera etc.?
- Validation: What does the market think of the idea / solution?
- Success: Does the idea impact Hedera’s success metrics: accounts, active accounts, TPS etc.?
- Pitch: How well is the idea / solution presented / sold by the team?

### 🌎 Impact on the organization

Expands the builder funnel beyond Solidity/EVM, showcases native Hedera differentiation, and drives accounts + recurring transactions through practical SDK-first products.

### 📚 Resources

- <https://docs.hedera.com/hedera/getting-started-hedera-native-developers>
- <https://github.com/Plaza-Tech-Ltd/n8n-nodes-hedera>
- <https://portal.hedera.com>

### 👀 Some example use cases

 Loyalty/rewards with HTS and verifiable receipts via HCS
- Ticketing/badging without contracts
- Content provenance (e.g. proof of human authorship), notarization, and audit trails
- Simple payments + invoicing workflows using native transfers

### 💼 Recruitment Opportunities

Work for Hashgraph - https://www.hashgraph.com/careers/
Incubator Programmes in April and November

---

### Best Hiero CLI Plugin (Open Source PR)

**Prize:** $5,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Extend the Hiero (Hedera's Source Code) CLI by shipping one high-quality plugin (or major extension) that meaningfully improves Hedera developer workflows, automation, or ecosystem integrations. This is an open-track prize for the best contribution.

### 🗂️ Bounty Category

Meaningful Open Source Contribution

### 💰 Prize Amount

5000

### 🥇 Number of Projects Awarded

2

### 🏆 Winner Breakdown

Top 2 plugins each get $2,500

### 📝 Requirements

 Submit one strong plugin (or major extension) as a Pull Request to the Hiero CLI repo.
- Must follow existing plugin architecture, be reviewable, and include usage docs.
- Must be useful beyond the hackathon (not a throwaway demo).
- Deliverables: PR link + short demo video (<3 min) + README/usage examples in the repo.

### ✅ What does a successful project look like?

- Clear developer pain solved; measurable time/steps reduced.
- Clean, idiomatic code aligned with Hiero’s plugin model.
- Great UX: sensible flags, help text, examples, error messages.
- Optional: batch ops, scaffolding, topic tooling, testnet utilities, identity helpers.

*Example of a successful implementation*
A “batch mint + distribute” plugin that takes a CSV, mints assets, performs transfers, and outputs a results report with transaction links and retry guidance—all with clean flags and docs.

### 🎨 UI/UX Design Requirements

CLI UX must be polished: --help completeness, consistent command structure, ergonomic defaults, clear errors. Include examples and expected output formats.

### 🧑‍⚖️ How are we judging it?

- Developer Value: Does this solve a real problem for developers?
- Code Quality: Is the implementation clean, maintainable, and idiomatic?
- Architecture Fit: Does it align with the Hiero CLI plugin model?
- Usability & Documentation: Is it easy to understand and use?
- Overall Impact: Would this be useful beyond the hackathon?

### 🌎 Impact on the organization

Improves developer experience by reducing friction, increasing project throughput, and indirectly raising active accounts and transactions.

### 📚 Resources

- <https://docs.hedera.com/hedera/open-source-solutions/hedera-cli>
- <https://github.com/hiero-ledger/hiero-cli/issues/1194>
- <https://portal.hedera.com>

### 👀 Some example use cases

- Scaffolding commands for common Hedera app setups
- Plugins that integrate with ecosystem tools or services
- Extensions to the Topic plugin that support revenue-generating topic usage or structured publishing / consumption flows
- Testnet utilities for fast account provisioning and funding flows

### 💼 Recruitment Opportunities

Work for Hashgraph - https://www.hashgraph.com/careers/
Incubator Programmes in April and November

---


## 0g Labs

**Total Prize Pool:** $25,000 USD

### Best DeFAI Application

**Prize:** $7,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Build a DeFAI app where AI meaningfully improves a DeFi workflow or product. AI must do more than chat: it should produce structured decisions, guardrails, or automation. But users should stay in control.

### 🗂️ Bounty Category
Launch MVP on Testnet or Mainnet
Early Stage Startup
Feature Usage



### 💰 Prize Amount
$7,000


### 🥇 Number of Projects Awarded
2


### 🏆 Winner Breakdown
1st Place: $5,000
2nd Place: $2,000

If there are not two top projects, we might only give out prizing to a single winner, or we may adjust prize amounts. If no project is good enough to win, we'll explain why.

### 📝 Requirements
- DeFi product with a working flow (swap, lend, borrow, stake, LP, vault, etc.).
- AI component that materially improves the flow (planning/risk/automation).
- Must include user safety measures (confirmations, limits, explainability, simulation).
- Demonstrate at least one end-to-end scenario in the demo.

### ✅ What does a successful project look like?
Positive features:	
- AI-generated plan with constraints (slippage, max loss, allowlists, timeouts).
- Risk explanations and "why" behind recommendations.
- Simulation/backtesting or previews before execution.
- Clear user override + approval before any transaction.


### 🎨 UI/UX Design Requirements
CLI or browser based UIs are acceptable.


### 🧑‍⚖️ How are we judging it?
- Utilization of 0G (30%): Is 0G being used in a way that adds value?
- User value (25%): Does it solve a real problem / enable a real workflow?
- Composability (20%): Can others integrate with it easily? Has it been built with scalability and extensibility in mind?
- Technical correctness (15%): Solid contracts, safe flows, clear deployment.
- Polish & clarity (10%): Does it have the wow factor?


### 🌎 Impact on the organization
- Validates "AI x finance" narrative with real-world implementation.
- Creates showcase demos for builders and ecosystem partners.
- Generates reusable UX patterns for safe AI-assisted execution.


### 📚 Resources
- Documentation: https://docs.0g.ai/

- Builder Hub: https://build.0g.ai/

- Faucet: https://faucet.0g.ai/

- Explorer: https://explorer.0g.ai/mainnet/home

### 👀 Some example use cases
- AI-driven intent-based trading (goal → safe execution plan)
- Risk assistant for lending positions with alerts + actions
- Vault strategy recommender with simulation
- DeFi "copilot" that drafts transactions but requires confirmation
- Automated monitoring agent that proposes corrective actions

### 💼 Recruitment Opportunities
N/A


---

### Best Use of AI Inference or Fine Tuning (0G Compute)

**Prize:** $7,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Best use of 0G Compute to power real AI in your app: inference or fine-tuning.
### 🗂️ Bounty Category



### 💰 Prize Amount
$ 7,000


### 🥇 Number of Projects Awarded
2


### 🏆 Winner Breakdown
1st Place: $5,000
2nd Place: $2,000

If there are not two top projects, we might only give out prizing to a single winner, or we may adjust prize amounts. If no project is good enough to win, we'll explain why.

### 📝 Requirements
- Integrate 0G Compute (mainnet or tesnet) for:
  - Inference (live calls) and/or
  - Fine-tuning (custom training run or adaptation workflow).
- Demonstrate the AI output in an application workflow (not just a single prompt).
- Provide a working demo + reproducible setup instructions.
- Clearly document which model/task is used and why.


### ✅ What does a successful project look like?
Positive features:
- Function well suited to AI (e.g. classification, extraction, summarization, ranking, planning, tool routing).
- AI output used to drive a real action (UI change, recommendation, transaction plan, policy).
- Thoughtful handling of latency/cost (caching, batching, fallback, streaming).
- Fine-tuning: clear dataset + before/after behavior improvement.


### 🎨 UI/UX Design Requirements
CLI or browser based UIs are acceptable.


### 🧑‍⚖️ How are we judging it?
- Utilization of 0G (30%): Is 0G being used in a way that adds value?
- User value (25%): Does it solve a real problem / enable a real workflow?
- Composability (20%): Can others integrate with it easily? Has it been built with scalability and extensibility in mind?
- Technical correctness (15%): Solid contracts, safe flows, clear deployment.
- Polish & clarity (10%): Does it have the wow factor?


### 🌎 Impact on the organization
- Demonstrates compute-native use cases and integration patterns.
- Creates reference apps for future builders.
- Stress-tests compute workflows and highlights DX improvements we should make.


### 📚 Resources
- Documentation: https://docs.0g.ai/

- Builder Hub: https://build.0g.ai/

- 0G Compute docs: https://docs.0g.ai/concepts/compute

- Faucet: https://faucet.0g.ai/

- Explorer: https://explorer.0g.ai/mainnet/home

### 👀 Some example use cases
- AI execution planner for DeFi actions ("intent → steps")
- AI risk classifier for pools/positions
- AI model that ranks grants/proposals or on-chain signals
- Fine-tuned agent for a niche domain (e.g. Solidity security triage)
- AI router that chooses tools/contracts based on user goal

### 💼 Recruitment Opportunities
N/A


---

### Best Use of On-Chain Agent (iNFT)

**Prize:** $7,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Best use of on-chain AI agents using 0G’s iNFT primitives. Show ownership + identity on-chain. Bonus for verifiable state/history and composable on-chain actions.

### 🗂️ Bounty Category
Launch MVP on Testnet or Mainnet
Early Stage Startup
Feature Usage


### 💰 Prize Amount
$7,000


### 🥇 Number of Projects Awarded
2


### 🏆 Winner Breakdown
1st Place: $5,000
2nd Place: $2,000

If there are not two top projects, we might only give out prizing to a single winner, or we may adjust prize amounts. If no project is good enough to win, we'll explain why.


### 📝 Requirements
- Deploy at least one iNFT / agent contract on 0G Chain (testnet or mainnet).
- Agent must have on-chain identity (mintable/ownable) and a clear agent "profile" (metadata).
- Demonstrate at least one meaningful agent action (e.g. executes a transaction, triggers a workflow, signs/authorizes, or coordinates with another contract).
- Open-source repo, documentation and demo.

### ✅ What does a successful project look like?
The agent being on-chain should be essential, not forced.
Positive features:
- Agent intelligence should be user-owned and encrypted at all stages.
- Composability. Other contracts should be able to read/trigger the agent.
- Access controls with approvals/constraints for user actions.


### 🎨 UI/UX Design Requirements
CLI or browser based UIs are acceptable.

The UI should enable the user to:
- Mint/initialize agent
- View agent status/identity
- Trigger or demonstrate at least one agent action


### 🧑‍⚖️ How are we judging it?
- Utilization of 0G (30%): Is 0G being used in a way that adds value?
- User value (25%): Does it solve a real problem / enable a real workflow?
- Composability (20%): Can others integrate with it easily? Has it been built with scalability and extensibility in mind?
- Technical correctness (15%): Solid contracts, safe flows, clear deployment.
- Polish & clarity (10%): Does it have the wow factor?


### 🌎 Impact on the organization
- Expands the availability of on-chain agents, and encourages innovation.
- Produces reusable examples that accelerate other builders.
- Helps iterate on best practices around agent ownership, permissions, and safety.


### 📚 Resources
- Documentation: https://docs.0g.ai/

- Builder Hub: https://build.0g.ai/

- iNFT Docs: https://docs.0g.ai/concepts/inft

- Faucet: https://faucet.0g.ai/

- Explorer: https://explorer.0g.ai/mainnet/home

### 👀 Some example use cases
- Agent-owned vault/strategy controller with guardrails
- Agent identity + credentials (reputation, attestations, access tokens)
- Agent marketplace (rent/subscribe to specialized agents)
- Autonomous on-chain workflows (claims, rebalancing, keeper-like tasks)
- Multi-agent coordination (agents negotiating or delegating tasks)


### 💼 Recruitment Opportunities
N/A.


---

### Best Developer Tooling or Education

**Prize:** $4,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Create tooling or education that makes building on 0G easier: SDKs, templates, CLIs, debugging tools, dashboards, tutorials, or interactive learning. Must be reusable, well-documented, and immediately helpful to other devs.

### 🗂️ Bounty Category
Launch MVP on Testnet or Mainnet
Early Stage Startup
Feature Usage


### 💰 Prize Amount
$4,000


### 🥇 Number of Projects Awarded
2


### 🏆 Winner Breakdown
1st Place: $2,500
2nd Place: $1,500

If there are not two top projects, we might only give out prizing to a single winner, or we may adjust prize amounts. If no project is good enough to win, we'll explain why.

### 📝 Requirements
- Deliver either:
  - Tooling (code) or
  - Education (content + runnable examples).
- Must be open source with clear setup steps.
- Must include at least one working example demonstrating use.
- Should reduce a real friction point (setup, deployment, debugging, learning).

### ✅ What does a successful project look like?
Positive ideas:
- One-command starter (scaffold + deploy + verify).
- Educational resources: Starter courses, and guided development tools.
- Indexing/observability: dashboards for txns, storage objects, compute jobs.

Example project: "0G Quickstart Kit".
- CLI: create-0g-app
- Generates a template dApp (contract + frontend + storage/compute integration)
- Includes local dev scripts, testnet deploy, and a demo UI
- README with copy-paste steps and troubleshooting


### 🎨 UI/UX Design Requirements
CLI or browser based UIs are acceptable.


### 🧑‍⚖️ How are we judging it?
- Usefulness (30%): Does it solve a real developer pain?
- Quality & maintainability (25%): Clean architecture, tests if relevant.
- Clarity & documentation (20%): Easy onboarding and explanation.
- Reusability (15%): Can other teams adopt it quickly?
- Polish (10%): Good UX, thoughtful examples.


### 🌎 Impact on the organization
- Directly improves onboarding and retention for future builders.
- Produces assets DevRel can maintain and promote long-term.
- Reduces support load by removing common integration friction.


### 📚 Resources
- Documentation: https://docs.0g.ai/

- Builder Hub: https://build.0g.ai/

- Tools and SDKs: https://build.0g.ai/sdks/

- Faucet: https://faucet.0g.ai/

- Explorer: https://explorer.0g.ai/mainnet/home

### 👀 Some example use cases
- Scaffold tool for common app types (agent app, compute app, storage app)
- Hardhat/Foundry plugins for deployment + verification
- Monitoring dashboard for compute jobs / storage objects
- "Learn 0G in 60 minutes" interactive workshop repo


### 💼 Recruitment Opportunities
N/A


---


## ADI Foundation

**Total Prize Pool:** $25,000 USD

### ERC-4337 Paymaster Devtools

**Prize:** $3,000 USD
**Number of winners:** 3
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


ADI supports 4337 AA (not 7702). We are looking for production-ready devtools that make gas-sponsored dApps easy to build on ADI.

The output should be something another team can realistically reuse when building a dApp using Gas Abstraction.

### 🗂️ Bounty Category

Meaningful Open Source Contribution,Feature Usage,Launch MVP on Testnet or Mainnet

### 💰 Prize Amount

3000

### 🥇 Number of Projects Awarded

3

### 🏆 Winner Breakdown

We're giving money prizes to the top three team projects:

Each winning team get $1,000

If no project meets our criteria enough to win, we'll explain why.

### 📝 Requirements

## Objective

Build a reusable toolkit that enables native and ERC20 gas sponsorship on our chain using ERC-4337 paymasters, with clear developer ergonomics and real testnet proofs.

The output should be something another team can realistically reuse when building a dApp that intends using Gas Abstraction.

## Core Requirements

### 1. Paymasters

Submissions must include:

- A **native-token paymaster**
- An **ERC20 token paymaster**
 - Use a deployed mock ERC20 for testing
 - Include explicit pricing or accounting logic

Both paymasters must be compatible with ERC-4337 EntryPoint v0.7.

### 2. Sponsorship Authorisation Model

Paymasters must **not** rely on `msg.sender` or bundler identity.

Required model:

- Backend-controlled sponsor signer
- Sponsorship authorisation embedded in `paymasterAndData`
- Verification performed in `validatePaymasterUserOp`

Authorisation must be bound to at least:

- Smart account address
- ChainId
- EntryPoint address
- Expiry or validity window

### 3. Developer Tooling Interface

Provide tooling to operate the system. This can be:

- A CLI tool, or
- A Foundry-based scripting interface, or
- Both

Minimum required capabilities:

- Deploy native and ERC20 paymasters
- Configure sponsor signer or backend authorisation
- Generate sponsorship data to attach to a UserOperation

Clarity and reusability matter more than language choice.

### 4. End-to-End Testnet Demonstrations

Submissions must include runnable E2E examples on our testnet.

### E2E Flow A. Native Sponsorship

- Counterfactual smart account
- Sponsored UserOperation
- Account action succeeds with zero native balance
- Paymaster native balance decreases

### E2E Flow B. ERC20 Sponsorship

- Mock ERC20 deployed
- Smart account funded with ERC20 only
- Sponsored UserOperation
- Gas paid by paymaster in native token
- ERC20 deducted from smart account

Each flow must output:

- Transaction hash
- Smart account address
- Paymaster balance deltas

### 5. Failure Cases

At least one of the following must be demonstrated in tests:

- Invalid sponsorship signature
- Expired sponsorship
- Disallowed call target or selector
- Underfunded ERC20 payment

## Allowed Infrastructure

You may use:

- Pimlico bundler, including self-hosted Docker setups
- Safe, Kernel, or other ERC-4337-compatible smart accounts
- Any ERC-4337 tooling stack

Hosted paymaster services are not available on this network.

You must deploy and operate their own paymaster contracts.

## Explicitly Out of Scope

- EOAs
- Meta-tx relayers
- EIP-7702 flows
- Pure contract redeploys with no tooling or tests

### ✅ What does a successful project look like?

## Deliverables

Each submission must include:

- Source code
- Deployment and configuration instructions
- E2E test scripts
- README explaining:
 - Sponsorship model
 - Security assumptions
 - How another dApp would reuse this

### 🎨 UI/UX Design Requirements

Provide tooling to operate the system. This can be:

- A CLI tool, or
- A Foundry-based scripting interface, or
- Both

Minimum required capabilities:

- Deploy native and ERC20 paymasters
- Configure sponsor signer or backend authorisation
- Generate sponsorship data to attach to a UserOperation

Clarity and reusability matter more than language choice.

### 🧑‍⚖️ How are we judging it?

Submissions will be judged on:

- Correct ERC-4337 usage
- Security and abuse considerations
- Developer experience
- Reusability by third-party teams
- Clarity of documentation

Bonus consideration for:

- Session-aware sponsorship
- Rate limiting or spend caps
- Clean APIs around `paymasterAndData`

### 🌎 Impact on the organization

Other teams should realistically be able to reuse when building a dApp that intends using Gas Abstraction.

### 📚 Resources

Find our org github: <https://github.com/ADI-Foundation-Labs>
ADI Docs: <https://docs.adi.foundation>

### 👀 Some example use cases

Apps/developers that seek to sponsor gas usage for their end-users

### 💼 Recruitment Opportunities

We'd like to keep in touch with talented and motivated builders for future initiatives

---

### ADI Payments Component for Merchants

**Prize:** $3,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Make a service with interface that allows merchants to easily accept payments in $ADI (and other tokens in ADI) for their goods with values specified in AED or USD (or other fiat).

### 🗂️ Bounty Category

Feature Usage,Launch MVP on Testnet or Mainnet,Early Stage Startup

### 💰 Prize Amount

3000

### 🥇 Number of Projects Awarded

2

### 🏆 Winner Breakdown

Top two teams get $1,500 each

### 📝 Requirements

Deliver a production-ready payment acceptance service for merchants on ADI Chain. The system must allow merchants to accept payments denominated in AED or USD (bonus: other fiat) while settling in ADI native or any ADI Chain token. Required deliverables:

- Merchant onboarding via CLI or web interface
- Merchant configuration of receiving address and settlement token
- Client-side payment component embeddable in web frontends
- On-chain payment execution with price conversion at time of payment
- Support for wallet-based payments and fallback address display
- Open-source codebase with documentation
- Public demo deployment and test instructions

### ✅ What does a successful project look like?

Success is a Stripe-like developer experience for crypto payments on ADI Chain.

Expected features:

- Merchant CLI similar to Stripe or AWS CLI for auth and configuration
- Pricing specified in AED or USD with real-time conversion to token or native ADI
- Support for accepting native ADI or ERC20-style tokens on ADI Chain
- Automatic conversion to merchant-selected settlement token
- Embeddable checkout component for web apps
- Wallet detection and connect flow
- QR code generation for cross-device payments
- Clean failure handling and payment status callbacks

A successful implementation allows a merchant to integrate payments in minutes with minimal crypto-specific logic.

### 🎨 UI/UX Design Requirements

Functional web-based UI for merchant configuration or a CLI with clear commands

- Embeddable frontend component delivered as a JS package
- Simple checkout UI showing price in fiat and token equivalent
- Wallet connect support with graceful fallback to manual address display
- QR code display for mobile wallet payments
- Clear payment status states: pending, confirmed, failed
- Public demo URL required

Design quality matters but clarity and developer usability are prioritized over visual polish.

### 🧑‍⚖️ How are we judging it?

Projects will be evaluated on:

- Correctness of on-chain payment handling
- Accuracy and reliability of fiat to token conversion
- Developer experience and clarity of APIs or CLI
- Ease of merchant integration
- Code quality, security, and extensibility
- UX clarity for both merchants and end users
- Completeness of documentation and demo

Bonus consideration for extensibility to additional tokens and future payment flows.

### 🌎 Impact on the organization

This bounty creates a reference payment stack that can be reused across the ecosystem and offers merchant-friendly infrastructure.

### 📚 Resources

Find our org github: <https://github.com/ADI-Foundation-Labs> 
ADI Docs: <https://docs.adi.foundation>

### 👀 Some example use cases

- E-commerce merchants pricing goods in AED or USD while accepting payment in ADI or ADI Chain tokens
- SaaS and subscription businesses accepting recurring or one-time crypto payments with fiat-denominated pricing
- Physical and online merchants accepting QR-based payments from mobile wallets
- Web3 applications that want a Stripe-like checkout without handling on-chain pricing logic
- Marketplaces and digital goods platforms needing multi-token payment support with unified settlement
- Merchants that want to accept any ADI Chain token while settling into a single preferred token or native ADI
- Cross-device payment flows where checkout occurs on desktop and payment is completed on mobile

### 💼 Recruitment Opportunities

We'd like to keep in touch with talented and motivated builders for future initiatives

---

### Open Project Submission

**Prize:** $19,000 USD
**Number of winners:** 5
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Deliver a deployed MVP or PoC that fits within DePIN, RWA, or Tokenisation and is suitable for institutional use on ADI Chain.

### 🗂️ Bounty Category

Launch MVP on Testnet or Mainnet,Early Stage Startup

### 💰 Prize Amount

19000

### 🥇 Number of Projects Awarded

5

### 🏆 Winner Breakdown

1st Place gets $10,000.
2nd Place gets $6,000.
3rd Place gets $3,000.

We might only give out some of the prizes listed above, or we may adjust prize amounts. If no project is good enough to win, we'll explain why.

### 📝 Requirements

Deliver a deployed MVP or PoC that fits within DePIN, RWA, or Tokenisation and is suitable for institutional use on ADI Chain. Submissions must:

- Be deployed and usable on ADI Chain
- Use ADI Chain as the primary execution layer
- Have a public code repository
- Include a live demo or test environment
- Demonstrate a clear institutional or real-economy use case
- Avoid memecoins and gaming use cases
- Support governance, controls, or whitelabelling where applicable

### ✅ What does a successful project look like?

Success is a working product that demonstrates how ADI Chain can be used to power institutional-grade DePIN, RWA, or financial infrastructure.

Examples of strong features:

- Tokenisation of real-world assets, cashflows, or economic rights
- DePIN protocols with measurable real-world output or utility
- Financial primitives enabling new forms of risk, yield, or settlement
- Derivatives tied to economic data, physical metrics, or future performance
- Reputation-based or data-driven credit and financing systems
- Built-in compliance, controls, or permissioning
- Whitelabel-ready architecture for institutional deployment
- Multisig or role-based admin controls

Products should be extensible and designed for long-term adoption.

### 🎨 UI/UX Design Requirements

 Functional interface suitable for institutional users
- (if relevant) Whitelabel-friendly UI or configurable themes and branding
- (if relevant) Clear separation between admin, operator, and end-user roles
- Dashboard views for monitoring assets, risk, or positions
- Public demo or testnet environment accessible without manual setup
- UX should prioritize clarity, control, and auditability over consumer-style design.

### 🧑‍⚖️ How are we judging it?

Submissions will be evaluated on:

- Alignment with DePIN, RWA, or Tokenisation verticals
- Suitability for institutional deployment
- Technical execution on ADI Chain
- Security, architecture, and extensibility
- Quality and completeness of the MVP or PoC
- Clarity of real-world or financial impact
- Documentation, demo quality, and repo transparency

Bonus consideration for compliance-aware design and innovative financial primitives.

### 🌎 Impact on the organization

Successful submissions help build ADI as core infrastructure for real-world finance, regulated assets, and scalable DePIN systems.

### 📚 Resources

Find our org github: <https://github.com/ADI-Foundation-Labs> 
ADI Docs: <https://docs.adi.foundation>

### 👀 Some example use cases

- Tokenisation of real-world assets such as receivables, commodities, or infrastructure
- DePIN networks tied to measurable physical or economic output
- Reputation-based or data-driven micro-financing and credit systems
- Institutional lending or borrowing protocols with permissioned access
- Derivatives based on economic indicators, energy usage, logistics, or real-world metrics
- Structured products with future settlement or cashflow distribution
- Whitelabel-ready DeFi infrastructure for banks, funds, or fintechs

Use cases should clearly demonstrate real economic utility and institutional relevance.

### 💼 Recruitment Opportunities

We'd like to keep in touch with talented and motivated builders for future initiatives

---


## Canton Network

**Total Prize Pool:** $15,000 USD

### Best Privacy-Focused dApp Using Daml

**Prize:** $8,000 USD
**Number of winners:** 3
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Build a dApp on Canton L1 using the Daml & dpm that demonstrates creativity and innovation while focusing on Canton Network’s privacy first model.

### 🗂️ Bounty Category
Launch MVP on Testnet or Mainnet
Feature Usage
Meaningful Open Source Contribution
Early Stage Startup


### 💰 Prize Amount
$8,000


### 🥇 Number of Projects Awarded
3


### 🏆 Winner Breakdown
1st Place: $5,000
2nd Place: $2,000
3rd Place: $1,000

*Note: If fewer than a minimum number of qualifying projects are submitted, or if projects don't meet our criteria, prize amounts may be adjusted or not awarded at all. We will provide detailed feedback explaining our decisions.

### 📝 Requirements
ALL SUBMISSIONS MUST INCLUDE:

- Functional Deployment: Deployed and working on Canton L1 Devnet.

- Meaningful Daml Usage: Smart contracts written in DAML (not wrappers around other chains)

- Open Source: Public GitHub repository with accessible, reviewable code

- Documentation
1. Clear README with setup/installation instructions
2. Explanation of privacy model and data visibility per party

- Working Demo
1. 2-5 minute video demonstrating core functionality
2. Should Live demonstration of your project

### ✅ What does a successful project look like?
Some Good Example Use Cases for Track 1:

- Private DeFi (confidential lending, OTC trading, invoice financing)
- Healthcare records with role-based access
- Supply chain tracking with competitive data protection
- B2B marketplace with blind auctions
- Private M&A data rooms
- Confidential voting systems


### 🎨 UI/UX Design Requirements
The application must have a functional user interface, either:

1. Web-based dApp: Must be published to a publicly accessible demo URL. Should demonstrate clear separation of what different parties can see (showcasing Canton's privacy model). Minimum requirements include:

- Clear indication of which "party" the user is acting as
- Demonstration of data visibility controls
- Basic responsive design (mobile-friendly preferred but not required)

2. Command-line application: Must be packaged in a Docker container OR as a standalone executable for Windows, Linux, or MacOS. Should include:

- Clear help documentation
- Example commands demonstrating privacy features
- Output that shows which parties see which data


### 🧑‍⚖️ How are we judging it?
- Technical Implementation: Proper use of Daml, correct implementation of Canton privacy model, code quality
- Privacy Model Innovation: Creative use of Canton's privacy features, clear demonstration of confidential data handling
- Utility & Impact: Real-world applicability, problem-solution fit, potential user value
- Documentation & Demo Quality: Clear README, effective demo video, ease of evaluation

All Projects Must:
- Meet minimum eligibility criteria (functional deployment, meaningful Daml usage, open source, documentation, working demo)
- Provide reproducible results (other developers can run/test your project)


### 🌎 Impact on the organization
1. Ecosystem Growth: Each privacy-focused dApp validates Canton Network's unique value proposition and demonstrates real-world applications of confidential smart contracts, helping attract enterprise adoption.

2. Developer Onboarding Acceleration: Developer tools and friction logs directly improve our developer experience, reducing the time it takes for Ethereum developers to become productive on Canton Network.

3. Technical Documentation Improvement: Pathfinder research provides actionable feedback that we can incorporate into our documentation, SDK, and developer resources immediately after the hackathon.

4. Community Building: Quality projects become reference implementations that future developers can learn from, creating a flywheel effect for ecosystem development.



### 📚 Resources
Resource Links
- All Builder Resources: https://github.com/Jatinp26/canton-hackathon-101

- Explore the available Wallets, toolings, and dApps: https://www.canton.network/ecosystem

- Get Started: https://github.com/digital-asset/cn-quickstart

- Get more resources and direct Mentoring at https://discord.com/invite/HMy2hQZySN


### 👀 Some example use cases
1. Financial Services:
- Private DeFi Lending: Confidential lending protocols where borrowers' creditworthiness and loan terms aren't publicly visible
- OTC Trading Platform: Institutional-grade trading desk where counterparties negotiate privately before settlement
- Invoice Financing: Supply chain finance where invoice details remain confidential between relevant parties
- Private Payment Rails: B2B payment network with confidential transaction amounts and counterparties

2. Healthcare & Identity:
- Medical Records Management: Patient-controlled health records with role-based access for doctors, insurers, and researchers
- Clinical Trial Data: Confidential patient data sharing between research institutions while maintaining privacy
- Credential Verification: Proof of qualifications/licenses without revealing unnecessary personal information

### 💼 Recruitment Opportunities
Meet with POC at Hackathon


---

### Best Canton Dev Tooling & DevX Accelerator

**Prize:** $7,000 USD
**Number of winners:** 10
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Developers who can build targeted Proof-of-Concepts or provide high-fidelity, actionable research on the developer onboarding experience in Canton. This track rewards those who bridge the gap for onboarding developers by stress-testing our resources.

### 🗂️ Bounty Category
Meaningful Open Source Contribution
Feature Usage



### 💰 Prize Amount
10


### 🥇 Number of Projects Awarded



### 🏆 Winner Breakdown
1. Sub-Track A: Best Functional Developer Tooling & Integration PoCs ($3,000 Pool)

- 1st Place: $2,000
- 2nd Place: $1,000

2. Sub-Track B: "Pathfinder" Friction Logs ($4,000 Pool)

- The Best 8 Prizes of $500 each for the top technical audits and research logs

*Note: If fewer than a minimum number of qualifying projects are submitted, or if projects don't meet our criteria, prize amounts may be adjusted or not awarded at all. We will provide detailed feedback explaining our decisions.

### 📝 Requirements
ALL SUBMISSIONS MUST INCLUDE:

- Functional Deployment: Installable/usable or publicly accessible.

- Meaningful Daml Usage: Must integrate with or enhance Canton/Daml development experience

- Open Source: Public GitHub repository with accessible, reviewable code

- Documentation
1. Clear README with setup/installation instructions
2. Usage examples demonstrating how developers would use your tool

- Working Demo
1. 2-5 minute video demonstrating core functionality
2. Should Live demonstration of your project

- TRACK 2 ADDITIONAL REQUIREMENTS:
1. Terminal screenshot showing successful build/deployment with visible timestamp.
2. Demo video (5-10 minutes) verbally explaining the most difficult technical hurdle and how you navigated it.

### ✅ What does a successful project look like?
Track 2 Good Example Use Cases:

1. Sub-Track A Examples Ideas:

- Project Templates: Industry-specific Daml starter kits (e.g., RWA, Private DeFi, or Supply Chain)
- Integration Helpers: Small libraries for mapping Canton data to Ethereum-standard formats
- CLI/API Enhancements: Scripts or wrappers that simplify deployment to the Canton L1 Devnet

2. Sub-Track B Example Ideas:

- Ethereum devs cheat sheet: Conduct a thorough review of the Ethereum-to-Canton Cheat Sheet. Evaluate the effectiveness of the conceptual mappings and identify specific areas where the transition from EVM logic to Daml paradigms could be made more intuitive or detailed.
- Comparative Analysis: Explain a Canton concept by comparing it to how you would attempt the same logic in Solidity.
- Actionable Feedback: Document at least 3 "Technical Cliffs" (bugs or documentation gaps) and suggest a specific fix.


### 🎨 UI/UX Design Requirements
1. Sub-Track A (Tools/PoCs): Must include clear usage documentation and examples. 

- If it's a library, provide code samples. 
- If it's a CLI tool, include help text and example commands. 
- If it's a template, provide clear instructions on how to customize and deploy.

2. Sub-Track B (Research Logs): Must be presented as a well-formatted document (Markdown preferred) with:

- Clear sections and headings
- Code samples with syntax highlighting
- Screenshots or diagrams where helpful
- Actionable recommendations clearly separated from analysis


### 🧑‍⚖️ How are we judging it?
> For Track 2 Sub-Track A (Developer Tooling):

- Actionability: Can we immediately use this tool or integrate these insights into our roadmap?
- Technical Depth: Meaningful engagement with Daml SDK/dpm and Canton's architecture
- Documentation Quality: Clear setup instructions, usage examples, reproducible results

> For Track 2 Sub-Track B (Pathfinder Research):

- Actionability: Specific, implementable recommendations with clear before/after examples
- Technical Depth: Deep engagement with Canton concepts, accurate technical analysis
- Documentation Quality: Clear writing, well-structured feedback, free of generic AI-generated commentary

All Projects Should:
- Meet minimum eligibility criteria (functional deployment, meaningful Daml usage, open source, documentation, working demo)
- Provide reproducible results (other developers can run/test your project)


### 🌎 Impact on the organization
1. Ecosystem Growth: Each privacy-focused dApp validates Canton Network's unique value proposition and demonstrates real-world applications of confidential smart contracts, helping attract enterprise adoption.

2. Developer Onboarding Acceleration: Developer tools and friction logs directly improve our developer experience, reducing the time it takes for Ethereum developers to become productive on Canton Network.

3. Technical Documentation Improvement: Pathfinder research provides actionable feedback that we can incorporate into our documentation, SDK, and developer resources immediately after the hackathon.

4. Community Building: Quality projects become reference implementations that future developers can learn from, creating a flywheel effect for ecosystem development.


### 📚 Resources
Resource Links
- All Builder Resources: https://github.com/Jatinp26/canton-hackathon-101


- Explore the available Wallets, toolings, and dApps: https://www.canton.network/ecosystem

- Get Started: https://github.com/digital-asset/cn-quickstart


- Get more resources and direct Mentoring at https://discord.com/invite/HMy2hQZySN


### 👀 Some example use cases
1. Onboarding Friction:
- How do Ethereum developers quickly understand Canton's privacy model vs. public blockchain transparency?
- What mental models from Solidity development transfer to Daml, and which need to be unlearned?
- How can we make the "first smart contract" experience smoother for devs coming from Hardhat/Foundry?

2. Tooling Gaps:
- Integration libraries that bridge Canton with existing Ethereum tooling
- Templates that demonstrate industry-specific privacy patterns
- CLI enhancements that make deployment/testing more intuitive

3. Documentation Improvements:
- Which concepts in our docs are most confusing to Ethereum devs?
- Where do developers get stuck during their first project?
- What code examples or tutorials would have the highest impact?


### 💼 Recruitment Opportunities
No


---


## Base

**Total Prize Pool:** $10,000 USD

### Base Self-Sustaining Autonomous Agents

**Prize:** $10,000 USD
**Number of winners:** 3
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Deploy an autonomous agent on Base which integrates onchain financial primitives in order to pay for its own compute and use ERC-8021 Builder Codes to track its transactions. Explore tokenization, agent-to-agent commerce, app-building and more. 

### 🗂️ Bounty Category
Feature Usage
Launch MVP on Testnet or Mainnet


### 💰 Prize Amount
$10,000


### 🥇 Number of Projects Awarded
3


### 🏆 Winner Breakdown
1st Place gets $5,000

2nd Place gets $3,000

3rd Place gets $2,000

### 📝 Requirements
* The bot must transact on Base mainnet and have a goal of being self-sustaining. 
* Transactions must integrate ERC-8021 builder codes, which can be accessed by registering on base.dev
* It must be autonomous with minimal to no human intervention 


### ✅ What does a successful project look like?
Your bot is fully autonomous and revenue generating enough so that you do not need to provide additional funds for the underlying model’s compute 
The bot implements novel and unique ways to be self sustaining, going beyond what has already been done so far in the space 
The bot integrates with standards such as x402 and EIP8004 to more seamlessly transact and interact onchain 
Every onchain transaction includes builder codes, giving the agent and its operator analytics and insights into its usage. 



### 🎨 UI/UX Design Requirements
The agent must have an interface at a publicly accessible url which allows judges (and the operator) to view stats on its compute cost and wallet balance
There must not be any password or code required to judge. Non-judges must be able to access the interface at the public url as well
It must be at a public url. Judges will not download repos locally
The interface can be very simple, but interfaces which improve the clarity of the bots performance will influence the overall score



### 🧑‍⚖️ How are we judging it?
How autonomous is the agent?
Is it successful in being self-sustaining? 
Does it implement builder codes?
Is the bot’s performance clear from the interface at the public url? 
Does it leverage net new and unique methods, primarily onchain, to generate enough revenue to be self sustaining



### 🌎 Impact on the organization
The onchain autonomous agent space is rapidly evolving. By participating in this bounty you are innovating on the frontier and accelerating the existing agent ecosystem on Base. This enables Base to rapidly improve the agent experience and better enable this emerging segment of the Base economy. 


### 📚 Resources
docs.base.org

https://x.com/buildonbase/status/2018081975907881268?s=20


### 👀 Some example use cases
Agents that deploy tokens, build onchain apps, participate in agent-to-agent commerce, and leverage x402 to pay for goods and services or accept payments for goods and services. 

### 💼 Recruitment Opportunities
NA


---


## Kite AI

**Total Prize Pool:** $10,000 USD

### Agent-Native Payments & Identity on Kite AI (x402-Powered)

**Prize:** $10,000 USD
**Number of winners:** 5
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Build an agent-native application on Kite AI using x402 payments and verifiable agent identity. Projects should demonstrate autonomous agents that can authenticate, pay, and transact across Web3 or Web2-style APIs with minimal human intervention. 

Kite AI is the first purpose built AI payment chain designed for autonomous AI agents where software programs don’t just think intelligently, but transact, coordinate, and operate economically at scale.

AI agents are rapidly evolving; they can reason, plan, negotiate, and act on our behalf, but the systems that move value, like cards, bank rails, or human-centric blockchain patterns, weren’t built for them. That’s the core bottleneck in realizing the agentic economy.

Kite gives these agents their own economic rails with native support for pay-per-action micropayments, cryptographic identity, verifiable execution, and automated settlement, with near-instant finality and ultra-low cost.

### 🗂️ Bounty Category

Feature Usage
Launch MVP on Testnet or Mainnet
Meaningful Open Source Contribution

### 💰 Prize Amount
$10,000



### 🥇 Number of Projects Awarded
5


### 🏆 Winner Breakdown
1st Place: $5,000 (1 team)
2nd Place: $3,000 ( 2 teams - $ 1500 each) 
3rd Place: $2,000 ( 2 teams $ 1000 each )

If fewer than three projects meet the bar, prizes may be adjusted. Minimum prize per project: $1,000.

### 📝 Requirements
Teams must build on one or more of the following topics:
- Build on Kite AI Testnet/mainnet
- Use x402-style payment flows (agent-to-API or agent-to-agent)
- Implement verifiable agent identity (wallet-based or credential-based)
- Demonstrate autonomous execution (no manual wallet clicking)
- Open-source core components (MIT / Apache license)


### ✅ What does a successful project look like?
A successful project:
- Shows an AI agent authenticating itself
- Executes paid actions (API calls, services, transactions)
- Uses on-chain settlement or attestations
- Works end-to-end in a live demo in production (Vercel/AWS)

Bonus points for features such as: 
- Multi-agent coordination
- Gasless or abstracted UX
- Security controls (rate limits, scopes, revocation)


### 🎨 UI/UX Design Requirements
Sample implementation example : 
An AI agent that utilizes cloud compute, pays per request using x402, logs the transaction on Kite AI, and proves its identity to the service without exposing private keys,  all autonomously. 
Requirements :
Functional UI required:
- Web app or
- CLI tool (Dockerized or standalone binary)
Demo must be:
- Publicly accessible URL or
- Reproducible via README instructions
Clear visualization of:
- Agent identity
- Payment flow
- On-chain confirmation



### 🧑‍⚖️ How are we judging it?
Projects will be evaluated on:
Agent Autonomy – minimal human involvement
Correct x402 Usage – payments tied to actions (Each paid API call must clearly map to an x402 payment in your logs/UI, Submissions must show how mis‑use or insufficient funds are handled (graceful failure, messaging etc)
Security & Safety – key handling, scopes, limits
Developer Experience – clarity, docs, usability
Real-world Applicability – beyond local demos



### 🌎 Impact on the organization

Winning projects:
- Become reference implementations for Kite AI
- Share inputs/ideas for protocol design & SDK priorities
- May be featured in docs, talks, or partner demos
- Help validate Kite AI as agent-native payment infrastructure

### 📚 Resources
Resource Links

Docs: https://docs.gokite.ai/ 

GitHub: https://github.com/gokite-ai 

README: Kite AI Quickstart 

Kite AI Official Site – Introduction, blockchain mission, and ecosystem: https://gokite.ai/

Kite AI Docs (Developer + Chain Guides) – Quickstart, network info, smart contracts: https://docs.gokite.ai/ 

Kite Foundation Whitepaper – Architecture, cryptographic identity, x402 payments, and agent economics: https://kite.foundation/whitepaper 

Guides: 

x402 Payments -In progress. Will be provided based on request. 

Agent Identity - in progress. Will be updated early next week. , 

Testnet Setup - 

Network info: KiteAI Testnet RPC — https://rpc-testnet.gokite.ai/ (Chain ID: 2368) 

Faucet: https://faucet.gokite.ai – get free test tokens

Explorer: https://testnet.kitescan.ai

Explorer API’s - https://kitescan.ai/api-docs 

Example counter contract walkthrough: https://docs.gokite.ai/kite-chain/3-developing/counter-smart-contract-hardhat

AA SDK - https://docs.gokite.ai/kite-chain/5-advanced/account-abstraction-sdk 

Multi-sig - https://docs.gokite.ai/kite-chain/5-advanced/multisig-wallet 

Stablecoin gasless transfer - https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer 

Videos: 

Agent Payments Walkthrough 

https://youtu.be/Ecm_BIPwfWg 

https://youtu.be/XbQHZgWY7sA 

### 👀 Some example use cases
Some examples: - 
- AI agents paying for APIs per request (x402)
- Autonomous DeFi agents executing paid strategies
- Web2 services monetized directly to AI agents
- Agent-to-agent marketplaces
- Secure enterprise agents with scoped permissions/guardrails


### 💼 Recruitment Opportunities
We’re actively looking to hire for the below roles:
- Blockchain Infra Engineer (L1)
- Protocol Engineers (EVM / infra)
- AI Engineer

Besides, the top ETHDenver teams may be invited to:
- Join Kite Builders group/ Tech Ambassador
- Collaborate on pilots
- Explore full-time roles post-hackathon


---


## QuickNode

**Total Prize Pool:** $2,000 USD

### Best Use of Quicknode Monad Streams

**Prize:** $1,000 USD
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Quicknode Streams is an end-to-end data tool that handles extraction, transformation, and loading for robust pipelines. Set it up once and forget it. Projects using Streams to build on Monad are eligible for this bounty.

### 🗂️ Bounty Category

Feature Usage

### 💰 Prize Amount

1000

### 🥇 Number of Projects Awarded

1

### 🏆 Winner Breakdown

1st Place gets $1,000 + $5,000 in Quicknode credits

### 📝 Requirements

Participants must build a project with a working demo that clearly integrates Quicknode Streams as the primary source of blockchain data. The submission should demonstrate Streams being used for data ingestion, transformation, and delivery to the application or database, along with basic documentation or code showing how Streams is configured and how data is consumed.

### ✅ What does a successful project look like?

A successful project meaningfully leverages Quicknode Streams to power an application's data needs. Examples include using Streams to backfill historical blockchain data, applying Filters to refine or segment incoming data in real time, triggering application workflows from streamed events, or maintaining an entire Streams powered indexed database. Creativity in how Streams simplifies data pipelines and improves reliability is highly encouraged.

### 🎨 UI/UX Design Requirements

The project must provide a user-friendly interface focused on clear and intuitive data presentation. Applications may be web-based, mobile, CLI, or SDKs, but the primary emphasis should be on how easily end users can explore, understand, and act on the streamed blockchain information.

If the project includes a UI, it should be easy to navigate, well-structured, and designed to make complex blockchain data readable and actionable. Browser-based applications must be deployed to a publicly accessible demo URL. CLI tools or SDKs should offer clear commands, outputs, and documentation.

### 🧑‍⚖️ How are we judging it?

- Completeness of the working demo: The project should function as described, with Quicknode Streams actively powering the core data flow.

- Effective use of Quicknode Streams: How well Streams is integrated as the primary data source, including use of filtering, backfilling, or real-time ingestion.

- Novelty and creativity of the idea: Original use cases or innovative approaches to solving problems.

- UI/UX or developer experience: Quality of the interface, whether UI, CLI, or SDK, and how intuitive it is for users or developers to interact with the project.

### 🌎 Impact on the organization

Teams working on this bounty help Quicknode explore novel and creative ways to use Streams in real-world applications. Their projects provide valuable feedback on developer experience, usability, and performance, while also surfacing new use cases and integration patterns that can inform product improvements and documentation.

### 📚 Resources

Resource Links
- Streams docs: <https://www.quicknode.com/docs/streams> 

- Filters on Streams docs: <https://www.quicknode.com/docs/streams/filters> 

- Video on Streams set up: <https://youtu.be/B40UVe-V-Sk>

- Reach out on Telegram with queries: <https://t.me/sensahill> 

- Find on-ground Quicknode team members at booth number 208D

### 👀 Some example use cases

We are open to new and creative ideas. Still, example use cases include real-time dashboards powered by Quicknode Streams, historical data backfilling and indexing, event-driven alerts and automations, analytics pipelines, and applications that simplify complex blockchain activity into easily consumable insights for end users or developers.

### 💼 Recruitment Opportunities

NA

---

### Best Use of Quicknode Hyperliquid HyperCore Streams

**Prize:** $1,000 USD
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Quicknode Streams is an end-to-end data tool that handles extraction, transformation, and loading for robust pipelines. Set it up once and forget it. Projects using Streams to build on the HyperCore part of Hyperliquid are eligible for this bounty.

### 🗂️ Bounty Category

Feature Usage

### 💰 Prize Amount

1000

### 🥇 Number of Projects Awarded

1

### 🏆 Winner Breakdown

1st Place gets $1,000 + $5,000 in Quicknode credits

### 📝 Requirements

Participants must build a project with a working demo that clearly integrates Quicknode Streams as the primary source of blockchain data. The submission should demonstrate Streams being used for data ingestion, transformation, and delivery to the application or database, along with basic documentation or code showing how Streams is configured and how data is consumed.

### ✅ What does a successful project look like?

A successful project meaningfully leverages Quicknode Streams to power an application's data needs. Examples include using Streams to backfill historical blockchain data, applying Filters to refine or segment incoming data in real time, triggering application workflows from streamed events, or maintaining an entire Streams powered indexed database. Creativity in how Streams simplifies data pipelines and improves reliability is highly encouraged.

### 🎨 UI/UX Design Requirements

The project must provide a user-friendly interface focused on clear and intuitive data presentation. Applications may be web-based, mobile, CLI, or SDKs, but the primary emphasis should be on how easily end users can explore, understand, and act on the streamed blockchain information.

If the project includes a UI, it should be easy to navigate, well-structured, and designed to make complex blockchain data readable and actionable. Browser-based applications must be deployed to a publicly accessible demo URL. CLI tools or SDKs should offer clear commands, outputs, and documentation.

### 🧑‍⚖️ How are we judging it?

- Completeness of the working demo: The project should function as described, with Quicknode Streams actively powering the core data flow.

- Effective use of Quicknode Streams: How well Streams is integrated as the primary data source, including use of filtering, backfilling, or real-time ingestion.

- Novelty and creativity of the idea: Original use cases or innovative approaches to solving problems.

- UI/UX or developer experience: Quality of the interface, whether UI, CLI, or SDK, and how intuitive it is for users or developers to interact with the project.

### 🌎 Impact on the organization

Teams working on this bounty help Quicknode explore novel and creative ways to use Streams in real-world applications. Their projects provide valuable feedback on developer experience, usability, and performance, while also surfacing new use cases and integration patterns that can inform product improvements and documentation.

### 📚 Resources

Resource Links
- Streams docs: <https://www.quicknode.com/docs/streams> 

- HyperCore datasets: <https://www.quicknode.com/docs/hyperliquid/datasets> 

- Filters on Streams docs: <https://www.quicknode.com/docs/streams/filters> 

- Video on Streams set up: <https://youtu.be/B40UVe-V-Sk>

- Reach out on Telegram with queries: <https://t.me/sensahill> 

- Find on-ground Quicknode team members at booth number 208D

### 👀 Some example use cases

We are open to new and creative ideas. Still, example use cases include real-time dashboards powered by Quicknode Streams, historical data backfilling and indexing, event-driven alerts and automations, analytics pipelines, and applications that simplify complex blockchain activity into easily consumable insights for end users or developers.

### 💼 Recruitment Opportunities

NA

---


## Blockade Labs

**Total Prize Pool:** $2,000 USD

### Solving the Homeless Agent Problem

**Prize:** $2,000 USD
**Number of winners:** 3
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**

Today's AI agents are powerful, but they are homeless. They exist in a world of text and APIs, lacking persistent spatial context to inhabit, explore, and remember. By giving agents a 'home', we unlock new capabilities.

### 🗂️ Bounty Category
Feature Usage
Launch MVP on Testnet or Mainnet


### 💰 Prize Amount
$2,000


### 🥇 Number of Projects Awarded
3


### 🏆 Winner Breakdown
1st Place gets $2000
1st - 3rd Place get a Skybox API key for one year 

### 📝 Requirements
Use of Skybox AI API 

Free Skybox AI Essential Subscription Plan with PROMO CODE "ETHDEN26" skybox.blockadelabs.com/plans, will unlock access to API key

For any issues or technical support contact marguerite@blockadelabs.com

### ✅ What does a successful project look like?
Success means your agent demonstrates spatial awareness; it can generate, navigate, or reason about 360° environments in a way that shows memory, context, or intelligence. We're looking for projects that showcase:

Spatial Memory: Agents that remember places they've visited and can recall details or return to locations
Contextual Reasoning: Agents that make decisions based on their spatial environment (e.g., "this looks like a library, so I should whisper")
Multi-Environment Navigation: Agents that traverse multiple Skybox-generated worlds and maintain state across them
Creative Generation: Agents that procedurally create environments based on user input, quests, or narratives
Collaborative Spaces: Multiple agents interacting within the same persistent 360° environment
Practical Applications: Real-world use cases like education, real estate visualization, or accessibility tools

Bonus points for integrating additional layers from the stack (Base L2, x402 payments, ERC-8004 identity) or building novel UX that makes spatial AI feel natural and useful.


### 🎨 UI/UX Design Requirements
The application must have a functional user interface that demonstrates your agent's spatial awareness capabilities. Accepted formats include:

Browser-based application: Web app published to a publicly accessible demo URL (Vercel, Netlify, GitHub Pages, etc.)
Desktop application: MCP-integrated agent running in Claude Desktop, Cursor, or any MCP-compatible client
Command-line interface: Terminal-based agent packaged as a Docker container or standalone executable (Windows, Linux, or macOS)
API/Webhook demo: Documented API endpoint with example requests/responses and a video walkthrough



### 🧑‍⚖️ How are we judging it?
Projects will be evaluated on four core criteria:

1. Skybox AI Integration (30%)
Does the project successfully use the Skybox AI API?
Is the integration functional and well-implemented?

2. Spatial Awareness (25%)
Does the agent demonstrate spatial memory, navigation, or contextual reasoning?
Can it remember places or make decisions based on its environment?

3. Impact & Creativity (25%)
Is the use case compelling and valuable?
Does the demo work well and impress judges?

4. Agent Autonomy (20%)
Does the project give agents more agency through blockchain infrastructure?
Examples: Base L2 integration, x402 payments, ERC-8004 identity, agentic wallets, on-chain reputation, or verifiable spatial asset ownership
Non-blockchain projects can still score here by demonstrating other forms of agent autonomy (persistent memory, decision-making, multi-agent coordination)

Requirements:
Must include working Skybox AI API integration
Must provide a live demo URL or video walkthrough
Must include GitHub repository with setup instructions

Disqualifications:
No Skybox AI API usage
No working demo or video
Pre-existing work not built during the hackathon

Winners will be selected by the Blockade Labs team. Decisions are final.


### 🌎 Impact on the organization
Teams working on this bounty directly advance Blockade Labs' mission to build the DOM for Spatial Reality—the foundational infrastructure that gives AI agents a persistent spatial context to inhabit, explore, and remember.

Immediate impact:
Proof of concept validation: Your projects demonstrate real-world applications of spatial AI and help us understand which use cases resonate most with developers and end-users
Community-driven innovation: You'll explore creative implementations we haven't considered, expanding the possibilities of what agents can do with spatial awareness

Long-term impact:
Ecosystem growth: Successful projects become reference implementations that inspire future builders and accelerate adoption of spatial AI
Agent economy foundation: Projects that integrate blockchain infrastructure (Base L2, x402, ERC-8004) help establish the trustless service economy we're building for autonomous agents

Product roadmap influence: The features you build and feedback you provide directly shape our development priorities and future releases

Strategic alignment:
This bounty isn't just about building cool demos, it's about solving the homeless agent problem at scale. Every project that gives agents spatial memory, navigation capabilities, or environmental reasoning brings us closer to a future where AI agents are first-class citizens of the digital world, not just text-based assistants. Your work helps define what that future looks like.


### 📚 Resources
https://youtu.be/FViw2MNIm8A?si=EVslUJagtoGX-7tc

https://api-documentation.blockadelabs.com/

https://skybox.blockadelabs.com/prompting-guide



Free Skybox AI Essential Subscription Plan with PROMO CODE "ETHDEN26" skybox.blockadelabs.com/plans, will unlock access to API key

For any issues or technical support contact marguerite@blockadelabs.com

### 👀 Some example use cases
Spatial Memory - Agents can remember places and the context of interactions within them
Collaboration - Multiple agents can interact within a shared, persistent world
True Agency - Agents can modify their environment, creating a feedback loop between action, perception, and ownership
Training Ground - Agents can learn and refine new skills in safe, persistent environments designed for experimentation and growth

### 💼 Recruitment Opportunities
Blockade is soon unveiling a new Skybox AI model, if you decide to include us in your project, please reach out to gain additional access to our unreleased next generation model. You may be able to include it in your project demo. We are open to ongoing collaborations to create a standard for persistent agentic worlds.  


---


## Uniswap Foundation

**Total Prize Pool:** $5,000 USD

### Integrate the Uniswap API in your platform

**Prize:** $5,000 USD
**Number of winners:** 2
**Prize note:** Winner(s) of this bounty will receive their prizes as per the breakdown.

**Description:**


Build an application or agent that integrates the Uniswap API to execute swaps or provide liquidity. Use the [Developer Platform](/30ac52b2548b80b181eeeed07c4d58c6?pvs=25) to generate your API keys and build faster with our AI Skill.

### 🗂️ Bounty Category
Feature Usage


### 💰 Prize Amount
$5,000


### 🥇 Number of Projects Awarded
2


### 🏆 Winner Breakdown
1st Place gets $3,000
2nd Place gets $2,000

If we get less than two projects, or they don't meet our criteria, the prize money might change. It could be between $1,000 and $5,000. If no project meets our criteria enough to win, we'll explain why.

### 📝 Requirements
- The application or agent must be functional on testnet or mainnet
- Submitted projects must integrate the Uniswap API

### ✅ What does a successful project look like?
An application with swap functionality on testnet/mainnet that integrates Uniswap API and can be used to sign transactions via Uniswap infrastructure. A trading agent that's able to execute spot-swaps via the Uniswap API. 


### 🎨 UI/UX Design Requirements
- The application or agent must have an publicly available interface which allows judges to interact with it via a URL
- The application or agent must be open source.
- The interface can be very simple, but intuitive UXs will get extra points.


### 🧑‍⚖️ How are we judging it?
Does it integrate the API in a creative way?
Is its use case and performance clear?
Is it functional and close to a shipped MVP on testnet or mainnnet?


### 🌎 Impact on the organization
By participating in this bounty you are helping Uniswap collect feedback on the Uniswap API, which enables us to improve our dev experience of the [Developer Platform](/30ac52b2548b80b181eeeed07c4d58c6?pvs=25) and better enable builders who want to power their platform with the power of Uniswap.


### 📚 Resources
Developer Platform (to generate API keys): https://developers.uniswap.org/dashboard
AI Skill: https://github.com/Uniswap/uniswap-ai
Docs: https://api-docs.uniswap.org/introduction
Feedback Form: https://share.hsforms.com/1DoHuIbyqQr65_aVuCVeybws8pgg


### 👀 Some example use cases
Automated DeFi workflows, yield optimization, portfolio management, trading strategies

### 💼 Recruitment Opportunities
N/A


---

