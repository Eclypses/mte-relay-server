import sqlite3 from "sqlite3";
import fastifyPlugin from "fastify-plugin";
import { FastifyInstance } from "fastify";

// extend FastifyRequest interface with decorator method
declare module "fastify" {
  interface FastifyRequest {
    recordMteUsage: typeof recordMteUsage;
    getTotalClientsByMonth: typeof getTotalClientsByMonth;
    getTotalMteUseCountByMonth: typeof getTotalMteUseCountByMonth;
  }
}

// hold db instance
let db: sqlite3.Database;

// plugin
async function initSqlite(
  fastify: FastifyInstance,
  options: {
    location: string;
  },
  done: any
) {
  db = await initDb(`${options.location}/mte-relay-db.sqlite3`);
  await setupDbTable();
  // add db methods to request object
  fastify.addHook("onRequest", (request, reply, done) => {
    request.recordMteUsage = recordMteUsage;
    request.getTotalClientsByMonth = getTotalClientsByMonth;
    request.getTotalMteUseCountByMonth = getTotalMteUseCountByMonth;
    done();
  });

  done();
}

// export plugin
export default fastifyPlugin(initSqlite);

// init db
function initDb(location: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(location, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(db);
      }
    });
  });
}

// Set up the database table
function setupDbTable() {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS mteClients (
      clientId TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      mteUseCount INTEGER NOT NULL,
      PRIMARY KEY (clientId, month, year)
    )`,
      (err: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve(void 0);
        }
      }
    );
  });
}

// drop db client table
function dropDbTable() {
  return new Promise((resolve, reject) => {
    db.run(`DROP TABLE mteClients`, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(void 0);
      }
    });
  });
}

// return all rows in the db
function getAllRows() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM mteClients`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// select row for a given client, month and year
function selectRow(clientId: string, month: number, year: number) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM mteClients WHERE clientId = ? AND month = ? AND year = ?`,
      [clientId, month, year],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

// insert a new row for a given client, month and year
function insertRow(clientId: string, month: number, year: number) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO mteClients (clientId, month, year, mteUseCount) VALUES (?, ?, ?, ?)`,
      [clientId, month, year, 1],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(void 0);
        }
      }
    );
  });
}

// update the mteUseCount count for a given client, month and year
function updateMteUsageCount(clientId: string, month: number, year: number) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE mteClients SET mteUseCount = mteUseCount + 1 WHERE clientId = ? AND month = ? AND year = ?`,
      [clientId, month, year],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(void 0);
        }
      }
    );
  });
}

// get total mteUseCount for a given month and year
function getTotalMteUseCountByMonth(month: number, year: number) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const _month = month ?? now.getMonth();
    const _year = year || now.getFullYear();
    db.get(
      `SELECT SUM(mteUseCount) AS total FROM mteClients WHERE month = ? AND year = ?`,
      [_month, _year],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.total || 0);
        }
      }
    );
  });
}

// get total mteClients for a given month and year
function getTotalClientsByMonth(month: number, year: number) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const _month = month ?? now.getMonth();
    const _year = year || now.getFullYear();
    db.get(
      `SELECT COUNT(*) AS total FROM (SELECT DISTINCT clientId FROM mteClients WHERE month = ? AND year = ?)`,
      [_month, _year],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.total);
        }
      }
    );
  });
}

// record a client request
async function recordMteUsage(clientId: string) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const row = await selectRow(clientId, month, year);
  if (!row) {
    await insertRow(clientId, month, year);
  } else {
    await updateMteUsageCount(clientId, month, year);
  }
}
