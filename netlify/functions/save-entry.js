// netlify/functions/save-entry.js

// Netlify utilise Node 18+, donc fetch est déjà disponible globalement.

exports.handler = async function (event, context) {
  // Autoriser les requêtes depuis ton site
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Réponse au préflight CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "OK",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: "Method Not Allowed",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const newEntry = body.entry;

    if (!newEntry || !newEntry.id) {
      return {
        statusCode: 400,
        headers,
        body: "Missing entry or entry.id",
      };
    }

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // ex: "Capucine04/GB2"
    const filePath = process.env.GITHUB_FILE_PATH; // ex: "data/entries.json"

    if (!token || !repo || !filePath) {
      return {
        statusCode: 500,
        headers,
        body: "Missing GitHub configuration",
      };
    }

    const apiBase = "https://api.github.com";

    const commonHeaders = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "netlify-function-grandboard",
      Accept: "application/vnd.github+json",
    };

    // 1) Récupérer le fichier actuel sur GitHub
    const getRes = await fetch(
      `${apiBase}/repos/${repo}/contents/${filePath}`,
      {
        headers: commonHeaders,
      }
    );

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

    let data = {};
    try {
      data = JSON.parse(contentJson);
    } catch (e) {
      data = {};
    }

    if (Array.isArray(data)) {
      // ancien format → on met dans data.entries
      data = { entries: data };
    }

    if (!Array.isArray(data.entries)) {
      data.entries = [];
    }

    // 2) Ajouter ou remplacer l'entrée selon son id
    const idx = data.entries.findIndex((e) => e.id === newEntry.id);
    if (idx >= 0) {
      data.entries[idx] = newEntry;
    } else {
      data.entries.push(newEntry);
    }

    const newContent = Buffer.from(
      JSON.stringify(data, null, 2),
      "utf8"
    ).toString("base64");

    // 3) Commit du nouveau fichier sur GitHub
    const putRes = await fetch(
      `${apiBase}/repos/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Update entries via Grand Board`,
          content: newContent,
          sha: fileData.sha,
        }),
      }
    );

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
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: `Server error: ${err.message}`,
    };
  }
};
