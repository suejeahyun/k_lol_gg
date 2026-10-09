process.env.V2_DB_CONTRACT_SCOPE = "recovery";

const { runDataContracts } = await import("./run-data-contracts");
await runDataContracts();

export {};
