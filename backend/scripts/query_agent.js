const { db } = require('../database/init');

const dbGet = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) {
      reject(err);
    } else {
      resolve(row);
    }
  });
});

async function getAgentPrompt() {
  try {
    const row = await dbGet("SELECT responsibilities_and_functions FROM agents WHERE agent_id = ?", ['006']);
    if (row) {
      console.log(row.responsibilities_and_functions);
    } else {
      console.log("Agent with ID 006 not found.");
    }
  } catch (err) {
    console.error("Error querying the database:", err);
  } finally {
    db.close();
  }
}

getAgentPrompt();