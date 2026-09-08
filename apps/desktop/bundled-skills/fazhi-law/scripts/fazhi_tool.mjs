#!/usr/bin/env node
// fazhi_tool.mjs - CLI entrypoint for Fazhi Law skill
import { searchLaw, getArticle, searchCase } from "./fazhi_client.mjs";
import { saveApiKey, getApiKey, getConfigPath } from "./fazhi_env.mjs";

const [, , command, ...args] = process.argv;

function printHelp() {
  console.log(`
Fazhi Law Tool CLI

Commands:
  set-key <api-key>
      Save the API key to ~/.fazhi/config for reuse on later runs.

  search-law <query>
      Semantic search for law articles matching the query.

  get-article <title> <number>
      Exactly retrieve a law article by title and article number.

  search-case <query>
      Semantic search for judicial cases matching the query.

Options:
  --help    Show this help message

Examples:
  node fazhi_tool.mjs set-key "your-api-key"
  node fazhi_tool.mjs search-law "劳动合同解除 经济补偿"
  node fazhi_tool.mjs get-article "民法典" "第一千零七十九条"
  node fazhi_tool.mjs search-case "房屋租赁合同到期后房东拒绝退还押金"
`);
}

async function main() {
  if (!command || command === "--help") {
    printHelp();
    process.exit(0);
  }

  try {
    if (command === "set-key") {
      const key = args.join(" ");
      if (!key) {
        console.error("Error: set-key requires an api key");
        process.exit(1);
      }
      const configPath = saveApiKey(key);
      console.log(`API Key saved to ${configPath}`);
      process.exit(0);

    } else if (command === "search-law") {
      const query = args.join(" ");
      if (!query) {
        console.error("Error: search-law requires a query string");
        process.exit(1);
      }
      const result = await searchLaw(query);
      console.log(JSON.stringify(result, null, 2));

    } else if (command === "get-article") {
      const [title, number] = args;
      if (!title || !number) {
        console.error("Error: get-article requires <title> and <number>");
        process.exit(1);
      }
      const result = await getArticle(title, number);
      console.log(JSON.stringify(result, null, 2));

    } else if (command === "search-case") {
      const query = args.join(" ");
      if (!query) {
        console.error("Error: search-case requires a query string");
        process.exit(1);
      }
      const result = await searchCase(query);
      console.log(JSON.stringify(result, null, 2));

    } else {
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();