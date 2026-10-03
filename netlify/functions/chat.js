const MODEL_URL =
  "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return response(405, {
      error: "Method not allowed."
    });
  }

  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return response(500, {
      error:
        "REPLICATE_API_TOKEN is missing from Netlify environment variables."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return response(400, {
      error: "Invalid JSON sent to the chat function."
    });
  }

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  if (!message) {
    return response(400, {
      error: "Message is empty."
    });
  }

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];

  const systemPrompt =
    typeof body.systemPrompt === "string"
      ? body.systemPrompt.trim()
      : "";

  let temperature =
    Number(body.temperature);

  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2
  ) {
    temperature = 1;
  }

  let maxTokens =
    Number(body.maxTokens);

  if (
    !Number.isFinite(maxTokens) ||
    maxTokens < 100
  ) {
    maxTokens = 2000;
  }

  if (maxTokens > 8000) {
    maxTokens = 8000;
  }

  const messages = [];

  /*
   * Add previous conversation messages.
   */
  for (const item of history) {
    if (!item) {
      continue;
    }

    if (
      item.role !== "user" &&
      item.role !== "assistant"
    ) {
      continue;
    }

    if (
      typeof item.content !== "string"
    ) {
      continue;
    }

    const content =
      item.content.trim();

    if (!content) {
      continue;
    }

    messages.push({
      role: item.role,
      content: content
    });
  }

  /*
   * Optional image sent from the browser.
   */
  const imageData =
    typeof body.imageData === "string"
      ? body.imageData.trim()
      : "";

  let userContent = message;

  if (imageData) {
    /*
     * Prevent extremely large requests.
     */
    if (imageData.length > 9000000) {
      return response(413, {
        error:
          "Image is too large. Please choose a smaller image."
      });
    }

    userContent = [
      {
        type: "text",
        text: message
      },
      {
        type: "image_url",
        image_url: {
          url: imageData
        }
      }
    ];
  }

  messages.push({
    role: "user",
    content: userContent
  });

  /*
   * Build Replicate input.
   */
  const input = {
    messages: messages,
    temperature: temperature,
    max_completion_tokens: maxTokens
  };

  if (systemPrompt) {
    input.system_prompt = systemPrompt;
  }

  try {
    const apiResponse = await fetch(
      MODEL_URL,
      {
        method: "POST",
        headers: {
          "Authorization":
            "Bearer " + token,

          "Content-Type":
            "application/json",

          "Prefer":
            "wait"
        },

        body: JSON.stringify({
          input: input
        })
      }
    );

    const rawText =
      await apiResponse.text();

    let data = {};

    try {
      data =
        rawText
          ? JSON.parse(rawText)
          : {};
    } catch (error) {
      console.error(
        "Replicate returned invalid JSON:",
        rawText
      );

      return response(502, {
        error:
          "Replicate returned an invalid response."
      });
    }

    /*
     * Replicate/API error.
     */
    if (!apiResponse.ok) {
      const errorMessage =
        getReplicateError(data);

      console.error(
        "Replicate API error:",
        apiResponse.status,
        errorMessage
      );

      return response(
        apiResponse.status,
        {
          error: errorMessage
        }
      );
    }

    /*
     * Extract the AI response.
     */
    const reply =
      getReply(data);

    if (!reply) {
      console.error(
        "No usable AI output:",
        JSON.stringify(data)
      );

      return response(502, {
        error:
          "The AI returned no usable text."
      });
    }

    return response(200, {
      reply: reply.trim()
    });
  } catch (error) {
    console.error(
      "Chat function error:",
      error
    );

    return response(500, {
      error:
        error &&
        typeof error.message === "string"
          ? error.message
          : "Could not connect to the AI service."
    });
  }
};


/* =========================================
   GET REPLICATE ERROR
========================================= */

function getReplicateError(data) {
  if (!data) {
    return "Replicate request failed.";
  }

  if (
    typeof data.detail === "string" &&
    data.detail.trim()
  ) {
    return data.detail.trim();
  }

  if (
    typeof data.error === "string" &&
    data.error.trim()
  ) {
    return data.error.trim();
  }

  if (
    typeof data.title === "string" &&
    data.title.trim()
  ) {
    return data.title.trim();
  }

  if (
    data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message;
  }

  return "Replicate request failed.";
}


/* =========================================
   EXTRACT AI RESPONSE
========================================= */

function getReply(data) {
  if (!data) {
    return "";
  }

  /*
   * Most common case:
   * output is an array.
   */
  if (Array.isArray(data.output)) {
    return data.output
      .map(function (item) {
        if (
          typeof item === "string"
        ) {
          return item;
        }

        if (
          item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }

        if (
          item &&
          typeof item.content === "string"
        ) {
          return item.content;
        }

        return "";
      })
      .join("");
  }

  /*
   * Output is directly a string.
   */
  if (
    typeof data.output === "string"
  ) {
    return data.output;
  }

  /*
   * Output is an object.
   */
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

    if (
      Array.isArray(data.output.choices)
    ) {
      return getReply({
        choices: data.output.choices
      });
    }
  }

  /*
   * Some responses may expose
   * choices directly.
   */
  if (
    Array.isArray(data.choices)
  ) {
    for (
      const choice of data.choices
    ) {
      if (!choice) {
        continue;
      }

      if (
        choice.message &&
        typeof choice.message.content === "string"
      ) {
        return choice.message.content;
      }

      if (
        typeof choice.text === "string"
      ) {
        return choice.text;
      }
    }
  }

  /*
   * Fallback text field.
   */
  if (
    typeof data.text === "string"
  ) {
    return data.text;
  }

  return "";
}


/* =========================================
   STANDARD NETLIFY RESPONSE
========================================= */

function response(statusCode, data) {
  return {
    statusCode: statusCode,

    headers: {
      "Content-Type":
        "application/json",

      "Cache-Control":
        "no-store",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",

      "Access-Control-Allow-Methods":
        "POST, OPTIONS"
    },

    body:
      JSON.stringify(data)
  };
}
