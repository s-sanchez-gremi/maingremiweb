// Fresh throwaway database "apex_test_forms" (never touches "apex"), migrated from the real SQL files.
import postgres from "postgres";
import { migrate } from "@apex/db/migrator";

export default async function setup() {
  const admin = postgres("postgres://apex:apex@localhost:5432/postgres", { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists apex_test_forms with (force)");
  await admin.unsafe("create database apex_test_forms");
  await admin.end();
  await migrate("postgres://apex:apex@localhost:5432/apex_test_forms");
}
