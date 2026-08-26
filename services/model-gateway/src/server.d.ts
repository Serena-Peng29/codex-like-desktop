import { type IncomingMessage, type ServerResponse } from "node:http";
export declare function createGatewayServer(): import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
