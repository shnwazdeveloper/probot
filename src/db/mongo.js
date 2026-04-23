'use strict';

const { MongoClient } = require('mongodb');

let client = null;
let database = null;

async function connectToMongo(uri, dbName) {
  if (client) return;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  database = client.db(dbName);
  console.log(`[MongoDB] Connected to database: ${dbName}`);
}

async function closeMongo() {
  if (!client) return;
  await client.close();
  client = null;
  database = null;
  console.log('[MongoDB] Connection closed');
}

function getDatabase() {
  if (!database) throw new Error('MongoDB is not connected');
  return database;
}

module.exports = { connectToMongo, closeMongo, getDatabase };
