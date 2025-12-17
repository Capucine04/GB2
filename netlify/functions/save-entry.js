// netlify/functions/save-entry.js

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "OK" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { action = "save", entry, id } = body;

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // ex: "Capucine04/GB2"
    const filePath = process.env.GITHUB_FILE_PATH; // ex: "entries.json"

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
      "User-Agent": "grandboard-netlify-function",
      Accept: "application/vnd.github+json",
    };

    // 1. Lire le fichier sur GitHub
    const getRes = await fetch(
      `${apiBase}/repos/${repo}/contents/${filePath}`,
      { headers: commonHeaders }
    );

    if (!getRes.ok) {
      const text = await getRes.text();
      throw new Error(text);
    }

    const fileData = await getRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf8");

    let data = JSON.parse(content);
    if (!Array.isArray(data.entries)) data.entries = [];

    // 2. Appliquer l’action
    if (action === "delete") {
      if (!id) throw new Error("Missing id for delete");
      data.entries = data.entries.filter((e) => e.id !== id);
    } else {
      if (!entry || !entry.id) throw new Error("Missing entry or entry.id");
      const index = data.entries.findIndex((e) => e.id === entry.id);
      if (index >= 0) data.entries[index] = entry;
      else data.entries.push(entry);
    }

    // 3. Réécrire le fichier
    const newContent = Buffer.from(
      JSON.stringify(data, null, 2),
      "utf8"
    ).toString("base64");

    const putRes = await fetch(
      `${apiBase}/repos/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          ...commonHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Update entries via Grand Board",
          content: newContent,
          sha: fileData.sha,
        }),
      }
    );

    if (!putRes.ok) {
      const text = await putRes.text();
      throw new Error(text);
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
      body: err.message,
    };
  }
};
