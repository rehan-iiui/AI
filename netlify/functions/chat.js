```js
// ======================================================
// NETLIFY FUNCTION
// Simple Chat -> Replicate
// ======================================================

const MODEL_URL =
  "https://api.replicate.com/v1/models/openai/gpt-4.1-nano/predictions";


// ======================================================
// MAIN FUNCTION
// ======================================================

exports.handler = async function (event) {

  // ----------------------------------------------------
  // Only allow POST
  // ----------------------------------------------------

  if (event.httpMethod !== "POST") {

    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Method not allowed. Use POST."
      })
    };

  }


  // ----------------------------------------------------
  // Check Replicate token
  // ----------------------------------------------------

  const token =
    process.env.REPLICATE_API_TOKEN;

  if (!token) {

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error:
          "REPLICATE_API_TOKEN is not configured in Netlify."
      })
    };

  }


  // ----------------------------------------------------
  // Read request body
  // ----------------------------------------------------

  let body;

  try {

    body =
      JSON.parse(
        event.body || "{}"
      );

  } catch (error) {

    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error:
          "Invalid JSON request."
      })
    };

  }


  // ----------------------------------------------------
  // Get values from browser
  // ----------------------------------------------------

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];

  const systemPrompt =
    typeof body.systemPrompt === "string"
      ? body.systemPrompt.trim()
      : "";


  // ----------------------------------------------------
  // Check message
  // ----------------------------------------------------

  if (!message) {

    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error:
          "Message cannot be empty."
      })
    };

  }


  // ----------------------------------------------------
  // Build messages
  // ----------------------------------------------------

  const messages = [];


  // System prompt
  if (systemPrompt) {

    messages.push({
      role: "system",
      content: systemPrompt
    });

  }


  // Previous chat history
  for (
    const item of history
  ) {

    if (
      !item ||
      typeof item !== "object"
    ) {
      continue;
    }


    const role =
      item.role;

    const content =
      item.content;


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


  // Current message
  messages.push({
    role: "user",
    content: message
  });


  // ----------------------------------------------------
  // Replicate request
  // ----------------------------------------------------

  const requestBody = {

    input: {

      messages:
        messages,

      temperature:
        1,

      top_p:
        1,

      frequency_penalty:
        0,

      presence_penalty:
        0,

      max_completion_tokens:
        2000,

      image_input:
        []

    }

  };


  try {

    console.log(
      "Sending request to Replicate..."
    );


    const response =
      await fetch(
        MODEL_URL,
        {

          method:
            "POST",

          headers: {

            "Authorization":
              "Bearer " + token,

            "Content-Type":
              "application/json",

            "Prefer":
              "wait"

          },

          body:
            JSON.stringify(
              requestBody
            )

        }
      );


    // --------------------------------------------------
    // Read Replicate response
    // --------------------------------------------------

    const responseText =
      await response.text();


    let data =
      null;


    try {

      data =
        responseText
          ? JSON.parse(
              responseText
            )
          : null;

    } catch (error) {

      console.error(
        "Replicate returned invalid JSON:",
        responseText
      );

      return {
        statusCode: 502,
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          error:
            "Replicate returned an invalid response."
        })
      };

    }


    // --------------------------------------------------
    // Replicate API error
    // --------------------------------------------------

    if (!response.ok) {

      console.error(
        "Replicate API error:",
        response.status,
        data
      );


      let detail =
        "Replicate request failed.";

      if (
        data &&
        typeof data.detail ===
          "string"
      ) {

        detail =
          data.detail;

      } else if (
        data &&
        typeof data.error ===
          "string"
      ) {

        detail =
          data.error;

      } else if (
        data &&
        typeof data.title ===
          "string"
      ) {

        detail =
          data.title;

      }


      return {
        statusCode:
          response.status,

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            error:
              detail
          })
      };

    }


    // --------------------------------------------------
    // Extract output
    // --------------------------------------------------

    const reply =
      extractOutput(
        data
      );


    if (!reply) {

      console.error(
        "No output from Replicate:",
        data
      );


      return {
        statusCode: 502,

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            error:
              "Replicate completed the request but returned no text."
          })
      };

    }


    // --------------------------------------------------
    // Success
    // --------------------------------------------------

    return {

      statusCode:
        200,

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify({
          reply:
            reply.trim()
        })

    };

  } catch (error) {

    // --------------------------------------------------
    // Server/network error
    // --------------------------------------------------

    console.error(
      "Function error:",
      error
    );


    return {

      statusCode:
        500,

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify({
          error:
            "The Netlify Function could not connect to Replicate."
        })

    };

  }

};


// ======================================================
// EXTRACT REPLICATE OUTPUT
// ======================================================

function extractOutput(data) {

  if (!data) {
    return "";
  }


  // ----------------------------------------------------
  // Array output
  // ----------------------------------------------------

  if (
    Array.isArray(
      data.output
    )
  ) {

    return data.output
      .map(
        function (part) {

          if (
            typeof part ===
            "string"
          ) {

            return part;

          }


          if (
            part &&
            typeof part.text ===
            "string"
          ) {

            return part.text;

          }


          if (
            part &&
            typeof part.content ===
            "string"
          ) {

            return part.content;

          }


          return String(
            part
          );

        }
      )
      .join("");

  }


  // ----------------------------------------------------
  // String output
  // ----------------------------------------------------

  if (
    typeof data.output ===
    "string"
  ) {

    return data.output;

  }


  // ----------------------------------------------------
  // Object output
  // ----------------------------------------------------

  if (
    data.output &&
    typeof data.output ===
      "object"
  ) {

    if (
      typeof data.output.text ===
      "string"
    ) {

      return data.output.text;

    }


    if (
      typeof data.output.content ===
      "string"
    ) {

      return data.output.content;

    }

  }


  // ----------------------------------------------------
  // Other possible text field
  // ----------------------------------------------------

  if (
    typeof data.text ===
    "string"
  ) {

    return data.text;

  }


  return "";
}
```
