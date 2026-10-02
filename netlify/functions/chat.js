const MODEL_URL =
  "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions";

exports.handler = async function (event) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed."
    });
  }

  // Get the secret API token from Netlify
  const apiKey =
    process.env.REPLICATE_API_TOKEN;

  if (!apiKey) {
    console.error(
      "REPLICATE_API_TOKEN is missing."
    );

    return jsonResponse(500, {
      error:
        "REPLICATE_API_TOKEN is not configured in Netlify Environment Variables."
    });
  }

  // Parse request body
  let body;

  try {
    body = JSON.parse(
      event.body || "{}"
    );
  } catch (error) {
    console.error(
      "Invalid JSON:",
      error
    );

    return jsonResponse(400, {
      error: "Invalid JSON request."
    });
  }

  // Get user's message
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

    const role = item.role;
    const content = item.content;

    if (
      (role === "user" ||
        role === "assistant") &&
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

  // Replicate model input
  const input = {
    messages: messages,
    temperature: 1,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_completion_tokens: 2000
  };

  // Add system prompt only if provided
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
            Authorization:
              "Bearer " + apiKey,

            "Content-Type":
              "application/json",

            Prefer:
              "wait"
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

    let data = {};

    try {
      data = responseText
        ? JSON.parse(responseText)
        : {};
    } catch (error) {
      console.error(
        "Replicate returned invalid JSON:",
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
        "Replicate returned no text:",
        data
      );

      return jsonResponse(502, {
        error:
          "Replicate returned no text."
      });
    }

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
        error &&
        error.message
          ? error.message
          : "Could not connect to Replicate."
    });
  }
};


/*
  Extract the AI text from
  different possible Replicate
  response formats.
*/

function extractReply(data) {
  if (!data) {
    return "";
  }

  // Output is an array
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

  // Output is a string
  if (
    typeof data.output === "string"
  ) {
    return data.output;
  }

  // Output is an object
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

  // Some responses may contain text directly
  if (
    typeof data.text === "string"
  ) {
    return data.text;
  }

  return "";
}


/*
  Create a Netlify JSON response.
*/

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
