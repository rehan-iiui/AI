const MODEL_URL =
  "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions";

exports.handler = async function (event) {

  // Only POST requests
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed."
    });
  }


  // Get API key from Netlify Environment Variables
  const apiKey =
    process.env.REPLICATE_API_TOKEN;


  if (!apiKey) {
    return jsonResponse(500, {
      error:
        "REPLICATE_API_TOKEN is not configured in Netlify Environment Variables."
    });
  }


  // Read request body
  let body;

  try {

    body =
      JSON.parse(event.body || "{}");

  } catch (error) {

    return jsonResponse(400, {
      error: "Invalid JSON request."
    });

  }


  // Get message
  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";


  if (!message) {

    return jsonResponse(400, {
      error: "Message cannot be empty."
    });

  }


  // Get conversation history
  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  // Get system prompt
  const systemPrompt =
    typeof body.systemPrompt === "string"
      ? body.systemPrompt.trim()
      : "";


  // Build messages
  const messages = [];


  for (const item of history) {

    if (!item || typeof item !== "object") {
      continue;
    }


    const role =
      item.role;

    const content =
      item.content;


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


  // Add current message
  messages.push({
    role: "user",
    content: message
  });


  // Replicate model input
  const input = {
    messages: messages,
    temperature: 1,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_completion_tokens: 2000,
    image_input: []
  };


  // Optional system prompt
  if (systemPrompt) {

    input.system_prompt =
      systemPrompt;

  }


  try {

    console.log(
      "Sending request to Replicate..."
    );


    const response =
      await fetch(
        MODEL_URL,
        {
          method: "POST",

          headers: {
            "Authorization":
              "Bearer " + apiKey,

            "Content-Type":
              "application/json",

            "Prefer":
              "wait"
          },

          body:
            JSON.stringify({
              input: input
            })
        }
      );


    const responseText =
      await response.text();


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


    // Replicate returned an error
    if (!response.ok) {

      console.error(
        "Replicate API error:",
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


    // Extract AI response
    const reply =
      extractReply(data);


    if (!reply) {

      console.error(
        "No AI output:",
        data
      );


      return jsonResponse(502, {
        error:
          "Replicate returned no text."
      });

    }


    // Success
    return jsonResponse(200, {
      reply: reply.trim()
    });


  } catch (error) {

    console.error(
      "Function error:",
      error
    );


    return jsonResponse(500, {
      error:
        "Could not connect to Replicate."
    });

  }

};


// ========================================================
// EXTRACT RESPONSE
// ========================================================

function extractReply(data) {

  if (!data) {
    return "";
  }


  if (Array.isArray(data.output)) {

    return data.output
      .map(function (part) {

        if (
          typeof part === "string"
        ) {
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


  if (
    typeof data.output === "string"
  ) {

    return data.output;

  }


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


  if (
    typeof data.text === "string"
  ) {

    return data.text;

  }


  return "";
}


// ========================================================
// JSON RESPONSE
// ========================================================

function jsonResponse(
  statusCode,
  data
) {

  return {

    statusCode: statusCode,

    headers: {
      "Content-Type":
        "application/json",

      "Cache-Control":
        "no-store"
    },

    body:
      JSON.stringify(data)

  };

}
```
