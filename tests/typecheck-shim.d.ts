// Alleen voor `npm run typecheck:tests`: minimale Cloudflare-types, zodat de tests zonder @cloudflare/workers-types (botst met lib DOM) de worker-bronnen kunnen typechecken.
type Ai = any;
interface KVNamespace { get(k: string, o?: any): Promise<any>; put(k: string, v: any, o?: any): Promise<void>; delete(k: string): Promise<void>; list(o?: any): Promise<any>; }
type DurableObjectNamespace<T = any> = any;
type DurableObjectState = any;
type ScheduledController = any;
type ExecutionContext = any;
declare module "cloudflare:workers" {
  export class DurableObject<E = any> { constructor(ctx: any, env: E); ctx: { storage: { get<T = unknown>(k: string): Promise<T | undefined>; put(k: string, v: any): Promise<void>; [m: string]: any }; [m: string]: any }; env: E; }
}
