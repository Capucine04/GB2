// netlify/functions/save-entry.js
// Node 18+ : fetch est disponible globalement

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Préflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "OK" };
  }

  // On autorise uniquement POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // action: "delete" ou "upsert" (par défaut)
    const action = body.action || "upsert";

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // ex: "Capucine04/GB2"
    const filePath = process.env.GITHUB_FILE_PATH; // ex: "data/entries.json"

    if (!token || !repo || !filePath) {
      return {
        statusCode: 500,
        headers,
        body: "Missing GitHub configuration (GITHUB_TOKEN / GITHUB_REPO / GITHUB_FILE_PATH)",
      };
    }

    const apiBase = "https://api.github.com";
    const commonHeaders = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "netlify-function-grandboard",
      Accept: "application/vnd.github+json",
    };

    // 1) Lire le fichier actuel sur GitHub
    const getRes = await fetch(`${apiBase}/repos/${repo}/contents/${filePath}`, {
      headers: commonHeaders,
    });

    if (!getRes.ok) {
      const text = await getRes.text();
      return {
        statusCode: 500,
        headers,
        body: `Error reading file from GitHub: ${text}`,
      };
    }

    const fileData = await getRes.json();

    const contentJson = Buffer.from(
      fileData.content,
      fileData.encoding || "base64"
    ).toString("utf8");

    let data;
    try {
      data = JSON.parse(contentJson);
    } catch {
      data = {};
    }

    // Normaliser vers { entries: [] }
    if (Array.isArray(data)) data = { entries: data };
    if (!data || typeof data !== "object") data = {};
    if (!Array.isArray(data.entries)) data.entries = [];

    // 2) Appliquer l’action demandée
    if (action === "delete") {
      const id = body.id;
      if (!id) {
        return { statusCode: 400, headers, body: "Missing id for delete" };
      }

      const before = data.entries.length;
      data.entries = data.entries.filter((e) => e.id !== id);
      const after = data.entries.length;

      // (optionnel) info utile pour debug
      // console.log(`Deleted ${before - after} entries`);
    } else {
      // upsert
      const newEntry = body.entry;
      if (!newEntry || !newEntry.id) {
        return {
          statusCode: 400,
          headers,
          body: "Missing entry or entry.id",
        };
      }

      const idx = data.entries.findIndex((e) => e.id === newEntry.id);
      if (idx >= 0) data.entries[idx] = newEntry;
      else data.entries.push(newEntry);
    }

    // 3) Réécrire le fichier sur GitHub (commit)
    const newContent = Buffer.from(JSON.stringify(data, null, 2), "utf8").toString(
      "base64"
    );

    const putRes = await fetch(`${apiBase}/repos/${repo}/contents/${filePath}`, {
      method: "PUT",
      headers: {
        ...commonHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message:
          action === "delete"
            ? "Delete entry via Grand Board"
            : "Update entries via Grand Board",
        content: newContent,
        sha: fileData.sha,
      }),
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return {
        statusCode: 500,
        headers,
        body: `Error writing file to GitHub: ${text}`,
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, action }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: `Server error: ${err.message}`,
    };
  }
};
