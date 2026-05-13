declare module "connect-sqlite3" {
  import session from "express-session";

  interface SQLiteStoreOptions {
    db?: string;
    dir?: string;
    table?: string;
    concurrentDB?: boolean;
  }

  interface SQLiteStoreConstructor {
    new (opts?: SQLiteStoreOptions): session.Store;
  }

  function connectSqlite3(s: typeof session): SQLiteStoreConstructor;
  export default connectSqlite3;
}
