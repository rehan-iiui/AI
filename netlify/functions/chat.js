const MODEL_URL =
  "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions";

exports.handler = async function (event) {

  if (event.httpMethod !== "POST") {
    return response(405, {
      error: "Method not allowed."
    });
  }

  const token =
    process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return response(500, {
      error: "REPLICATE_API_TOKEN is missing from Netlify."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return response(400, {
      error: "Invalid JSON."
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

  /*
   * These values come from the app's
   * Conversation Settings.
   *
   * Safe defaults are used if they are
   * missing or invalid.
   */

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

    if (!item.content.trim()) {
      continue;
    }

    messages.push({
      role: item.role,
      content: item.content.trim()
    });
  }

  messages.push({
    role: "user",
    content: message
  });

  /*
   * Keep the exact API structure that was
   * already working, while allowing the
   * UI settings to control temperature
   * and maximum completion tokens.
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

    const text =
      await apiResponse.text();

    let data;

    try {

      data = text
        ? JSON.parse(text)
        : {};

    } catch (error) {

      console.error(
        "Invalid Replicate JSON:",
        text
      );

      return response(502, {
        error:
          "Replicate returned invalid JSON."
      });

    }

    if (!apiResponse.ok) {

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

      return response(
        apiResponse.status,
        {
          error: errorMessage
        }
      );
    }

    const reply =
      getReply(data);

    if (!reply) {

      console.error(
        "Replicate returned no usable output:",
        JSON.stringify(data)
      );

      return response(502, {
        error:
          "Replicate returned no AI text."
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
        error.message
          ? error.message
          : "Could not connect to Replicate."
    });

  }
};


/*
 * Extract AI text from the different
 * output formats that Replicate may return.
 */

function getReply(data) {

  if (!data) {
    return "";
  }

  /*
   * Most common format:
   *
   * output: ["Hello", " there"]
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
   * Simple string output.
   */

  if (
    typeof data.output === "string"
  ) {

    return data.output;

  }


  /*
   * Object output.
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

  }


  /*
   * Some responses may expose text
   * directly on the response object.
   */

  if (
    typeof data.text === "string"
  ) {

    return data.text;

  }

  return "";
}


/*
 * Standard Netlify response helper.
 */

function response(
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

