const MODEL_URL =
  "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions";


module.exports = async function handler(req, res) {

  /* =========================================
     CORS
  ========================================= */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  /*
   * Browser preflight request.
   */
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  /* =========================================
     METHOD CHECK
  ========================================= */

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }


  /* =========================================
     GET API TOKEN
  ========================================= */

  const token =
    process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return res.status(500).json({
      error:
        "REPLICATE_API_TOKEN is missing from Vercel environment variables."
    });
  }


  /* =========================================
     READ REQUEST BODY
  ========================================= */

  let body = req.body;

  /*
   * Vercel normally parses JSON automatically,
   * but this also supports a string body.
   */

  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch (error) {
      return res.status(400).json({
        error:
          "Invalid JSON sent to the chat function."
      });
    }
  }

  body = body || {};


  /* =========================================
     MESSAGE
  ========================================= */

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  if (!message) {
    return res.status(400).json({
      error: "Message is empty."
    });
  }


  /* =========================================
     HISTORY
  ========================================= */

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];


  /* =========================================
     SYSTEM PROMPT
  ========================================= */

  const systemPrompt =
    typeof body.systemPrompt === "string"
      ? body.systemPrompt.trim()
      : "";


  /* =========================================
     TEMPERATURE
  ========================================= */

  let temperature =
    Number(body.temperature);

  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2
  ) {
    temperature = 1;
  }


  /* =========================================
     MAX TOKENS
  ========================================= */

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


  /* =========================================
     BUILD MESSAGES
  ========================================= */

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


  /* =========================================
     IMAGE SUPPORT
  ========================================= */

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
      return res.status(413).json({
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


  /* =========================================
     ADD CURRENT USER MESSAGE
  ========================================= */

  messages.push({
    role: "user",
    content: userContent
  });


  /* =========================================
     REPLICATE INPUT
  ========================================= */

  const input = {
    messages: messages,
    temperature: temperature,
    max_completion_tokens: maxTokens
  };


  if (systemPrompt) {
    input.system_prompt = systemPrompt;
  }


  /* =========================================
     SEND TO REPLICATE
  ========================================= */

  try {

    const apiResponse =
      await fetch(
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


    /* =========================================
       READ RESPONSE
    ========================================= */

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

      return res.status(502).json({
        error:
          "Replicate returned an invalid response."
      });
    }


    /* =========================================
       REPLICATE ERROR
    ========================================= */

    if (!apiResponse.ok) {

      const errorMessage =
        getReplicateError(data);


      console.error(
        "Replicate API error:",
        apiResponse.status,
        errorMessage
      );


      return res.status(
        apiResponse.status
      ).json({
        error: errorMessage
      });
    }


    /* =========================================
       GET AI RESPONSE
    ========================================= */

    const reply =
      getReply(data);


    if (!reply) {

      console.error(
        "No usable AI output:",
        JSON.stringify(data)
      );


      return res.status(502).json({
        error:
          "The AI returned no usable text."
      });
    }


    /* =========================================
       SUCCESS
    ========================================= */

    return res.status(200).json({
      reply: reply.trim()
    });


  } catch (error) {

    console.error(
      "Chat function error:",
      error
    );


    return res.status(500).json({
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
