const MODEL_URL =
  "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions";

exports.handler = async function (event) {

  // =====================================================
  // ONLY ALLOW POST
  // =====================================================

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed. Use POST."
    });
  }


  // =====================================================
  // READ REQUEST
  // =====================================================

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, {
      error: "Invalid JSON request."
    });
  }


  // =====================================================
  // API KEY FROM USER
  // =====================================================

  const apiKey =
    typeof body.apiKey === "string"
      ? body.apiKey.trim()
      : "";


  if (!apiKey) {
    return jsonResponse(400, {
      error: "No Replicate API key was provided. Open Settings and enter your API key."
    });
  }


  // =====================================================
  // MESSAGE
  // =====================================================

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";


  if (!message) {
    return jsonResponse(400, {
      error: "Message cannot be empty."
    });
  }


  // =====================================================
  // HISTORY
  // =====================================================

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  // =====================================================
  // SYSTEM PROMPT
  // =====================================================

  const systemPrompt =
    typeof body.systemPrompt === "string"
      ? body.systemPrompt.trim()
      : "";


  // =====================================================
  // BUILD MESSAGES
  // =====================================================

  const messages = [];


  for (const item of history) {

    if (!item || typeof item !== "object") {
      continue;
    }


    const role = item.role;

    const content = item.content;


    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.trim()
    ) {

      messages.push({
        role: role,
        content: content.trim()
      });

    }

  }


  // Add current user message

  messages.push({
    role: "user",
    content: message
  });


  // =====================================================
  // REPLICATE INPUT
  // =====================================================

  const input = {
    messages: messages,
    temperature: 1,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_completion_tokens: 2000,
    image_input: []
  };


  if (systemPrompt) {
    input.system_prompt = systemPrompt;
  }


  // =====================================================
  // SEND TO REPLICATE
  // =====================================================

  try {

    console.log("Sending request to Replicate");


    const response = await fetch(
      MODEL_URL,
      {
        method: "POST",

        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Prefer": "wait"
        },

        body: JSON.stringify({
          input: input
        })
      }
    );


    const responseText =
      await response.text();


    console.log(
      "Replicate status:",
      response.status
    );


    // ===================================================
    // PARSE RESPONSE
    // ===================================================

    let data;

    try {

      data =
        responseText
          ? JSON.parse(responseText)
          : {};

    } catch (error) {

      console.error(
        "Invalid Replicate response:",
        responseText
      );

      return jsonResponse(502, {
        error:
          "Replicate returned an invalid response."
      });

    }


    // ===================================================
    // REPLICATE ERROR
    // ===================================================

    if (!response.ok) {

      console.error(
        "Replicate error:",
        response.status,
        data
      );


      let errorMessage =
        "Replicate request failed.";


      if (
        data &&
        typeof data.detail === "string"
      ) {

        errorMessage =
          data.detail;

      } else if (
        data &&
        typeof data.error === "string"
      ) {

        errorMessage =
          data.error;

      } else if (
        data &&
        typeof data.title === "string"
      ) {

        errorMessage =
          data.title;

      }


      return jsonResponse(
        response.status,
        {
          error: errorMessage
        }
      );

    }


    // ===================================================
    // EXTRACT OUTPUT
    // ===================================================

    const reply =
      extractReply(data);


    if (!reply) {

      console.error(
        "Replicate returned no usable output:",
        data
      );

      return jsonResponse(502, {
        error:
          "Replicate completed the request but returned no text."
      });

    }


    // ===================================================
    // SUCCESS
    // =====================================================

    return jsonResponse(200, {
      reply: reply.trim()
    });


  } catch (error) {

    console.error(
      "Netlify Function error:",
      error
    );


    return jsonResponse(500, {
      error:
        "The Netlify Function could not connect to Replicate."
    });

  }

};


// ========================================================
// EXTRACT REPLICATE OUTPUT
// ========================================================

function extractReply(data) {

  if (!data) {
    return "";
  }


  // GPT-4.1 Nano currently returns output as
  // an array of strings.

  if (Array.isArray(data.output)) {

    return data.output
      .map(function (part) {

        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        if (
          part &&
          typeof part.content === "string"
        ) {
          return part.content;
        }

        return "";

      })
      .join("");

  }


  // Also support a normal string output.

  if (typeof data.output === "string") {
    return data.output;
  }


  // Other possible response shapes.

  if (
    data.output &&
    typeof data.output === "object"
  ) {

    if (
      typeof data.output.text === "string"
    ) {
      return data.output.text;
    }


    if (
      typeof data.output.content === "string"
    ) {
      return data.output.content;
    }

  }


  if (typeof data.text === "string") {
    return data.text;
  }


  return "";
}


// ========================================================
// JSON RESPONSE HELPER
// ========================================================

function jsonResponse(statusCode, data) {

  return {
    statusCode: statusCode,

    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },

    body: JSON.stringify(data)
  };

}
```
