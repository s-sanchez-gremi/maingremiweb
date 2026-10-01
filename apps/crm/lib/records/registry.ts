// Every entity the engine serves. Add a definition file under ./entities and list it here.
import type { Entity } from "./entity";
import { crmEntities } from "./entities/crm";
import { erpEntities } from "./entities/erp";

export const ENTITIES: Record<string, Entity> = Object.fromEntries([...crmEntities, ...erpEntities].map((e) => [e.key, e]));
export const entityByKey = (key: string) => ENTITIES[key];
/** Entities that have screens of their own (lookup-only ones such as users do not). */
export const screenEntity = (key: string) => { const e = ENTITIES[key]; return e && !e.hidden ? e : undefined; };
