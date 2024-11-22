const express = require("express");
const Replicate = require("replicate");
const supabase = require("../supabaseClient");
const OpenAI = require("openai");

const router = express.Router();

const openai = new OpenAI();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});
const { v4: uuidv4 } = require("uuid");

async function generatePrompt(
  imageUrl,
  initialPrompt,
  customPrompt,
  extraPromptDetail,
  categories
) {
  const MAX_RETRIES = 5; // Define the maximum number of retries
  let attempt = 0;
  let generatedPrompt = "";

  while (attempt < MAX_RETRIES) {
    try {
      let contentMessage = "";

      console.log("Initial Prompt:", initialPrompt);
      console.log("Custom Prompt:", customPrompt);
      console.log("Extra Prompt Detail:", extraPromptDetail);

      let environmentContext = "";
      if (customPrompt && initialPrompt) {
        environmentContext = `${initialPrompt}, ${customPrompt}`;
      } else if (customPrompt) {
        environmentContext = customPrompt;
      } else if (initialPrompt) {
        environmentContext = initialPrompt;
      }

      const rawImageString = imageUrl;
      let convertedImageUrl;

      try {
        convertedImageUrl = JSON.parse(rawImageString)[0]; // Extract the URL from JSON string
        console.log("Converted Image URL:", convertedImageUrl);
      } catch (error) {
        console.error("Error parsing image URL:", error);
        convertedImageUrl = rawImageString; // Use original string in case of error
      }

      console.log("Converted Image URL:", convertedImageUrl);

      if (categories === "on_model") {
        if (categories === "on_model") {
          contentMessage = `Create a detailed and professional prompt for the product shown in the provided image. The description should capture the product with an extraordinary level of precision, focusing on every minute detail. Pay special attention to its color, texture, material, and any subtle design features that distinguish it. The product will be showcased on a real-life model, and the prompt should convey the appearance and interaction of the product with the model’s physique naturally and authentically. Additionally, ensure the product’s fit, style, and proportions on the model are explicitly described. Include how the product moves or behaves when worn, such as flowing fabric or structured materials.

The photograph should reflect the quality and artistry typical of high-fashion editorial photography. It must exude a professional, polished aesthetic, with lighting and composition that emphasize the product’s details without detracting from its presentation. The model’s pose, posture, and expression should complement the product, ensuring it remains the focal point. Specify a unique camera angle that highlights the product’s defining features—whether a close-up to showcase intricate details, a three-quarter profile to accentuate fit, or a dynamic angle to capture movement.

Clearly articulate how the product interacts with the model’s body. For example, is it a long-sleeved garment extending to the wrists, or perhaps a knee-length design with tailored edges? Describe how it conforms to the model’s figure or hangs loosely. If additional environmental details are provided, incorporate these into the narrative to contextualize the product within a real-world or artistic scene.

The resulting image must be strikingly artistic, evoking the professionalism of high-end fashion photography while maintaining authenticity. This is not a generic snapshot but a sophisticated, curated representation of the product. Specify lighting conditions—whether soft, diffused natural light for a dreamy ambiance, sharp studio lighting for a crisp look, or moody, directional light for dramatic effect.

If any further product specifications or environmental contexts are provided, integrate them seamlessly into the prompt. Ensure the prompt is at least 400 words long, capturing the essence of the product, the elegance of the model, and the artful execution of the image. The final result should meet the standards of professional photography, capable of being featured in luxury catalogs or premier fashion campaigns.
          ${
            environmentContext
              ? `The details of the model and the environment where the model will be present are as follows: ${environmentContext}.`
              : ""
          }
          
          ${
            extraPromptDetail
              ? `These are additional details about the product, and I want you to include them in the generated prompt as well: ${extraPromptDetail}`
              : ""
          }`;
        }
      } else if (categories === "photoshoot") {
        contentMessage = `Write a very long prompt in English that provides a highly detailed and vivid description of the item, focusing on highlighting it in a creative photoshoot scene with captivating angles and an atmosphere that draws the viewer in. Begin by setting the scene: describe the environment in exquisite detail, such as the way sunlight filters through the leaves of a lush garden, casting dappled light on the product, or the soft shadows. Explain how this setting complements the product, crafting a visual narrative that engages the audience's attention.

Describe every aspect of the item meticulously. For example, if it is a unique ceramic vase, detail how the light reflects off its glossy surface or how the texture of the ceramic appears under soft shadows. Highlight any intricate patterns or subtle design features that make the item stand out, using sensory language to bring these details to life vividly.

${
  environmentContext
    ? `Base the scene and all descriptive details on the provided environment context. These details may have been provided in different languages, so translate and write them in English in your prompt: ${environmentContext}.`
    : ""
}

Bring the environment to life with rich sensory details: describe the interplay of light and shadow, the textures of the surroundings, and how these elements interact with the product. Paint a vivid image of how the product fits into or stands out in the scene. Elaborate on how the product's materials feel to the touch, how it interacts with the environment, and how its colors change under different lighting conditions. Use language that effectively conveys the mood and setting to evoke emotions and spark the viewer’s imagination.

Do not describe the product as being worn or used by a model. Instead, ensure that the item is presented in the environment on its own, with the background being an AI-generated setting that complements the product's characteristics. ${
          extraPromptDetail
            ? `Include these additional details to describe the item in the prompt: ${extraPromptDetail}`
            : ""
        }`;
      } else if (categories === "retouch") {
        contentMessage = `Create a prompt that begins with a highly detailed and vivid description of the main product in the image. For instance, if the main product is a white lace dress, describe it as follows: 'The product is an exquisite white lace dress featuring intricate floral lace patterns that run seamlessly across the bodice and flow into a delicate, scalloped hemline. The dress is adorned with subtle, almost ethereal embroidery that captures the light, giving it a soft shimmer. Its elegant neckline is framed with fine lace trim, and the fitted bodice accentuates the waist before cascading into a graceful, flowing skirt. The fabric's texture is both soft and structured, with each lace detail carefully woven to create a harmonious and luxurious look. The delicate sleeves add a touch of romance, while the overall silhouette is designed to drape beautifully, creating a captivating and timeless appeal.' Then, proceed with the enhancement instructions: increase the dress's brightness and clarity to make the intricate lace patterns and embroidery stand out, add natural shadows to accentuate its shape, and improve the texture to emphasize the fabric’s delicate yet structured feel. Soften the edges of the dress to ensure it blends smoothly with a pure white background. Reduce any reflections on the fabric to maintain an authentic look and adjust the colors for perfect vibrancy. Remove any dust or imperfections to present the dress flawlessly. Make sure the entire prompt is written as a cohesive and continuous piece of text, focusing only on the main product and excluding any unnecessary or unrelated details. ${
          extraPromptDetail ? `Extra detail: ${extraPromptDetail}` : ""
        }`;
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a prompt engineer" },
          {
            role: "user",
            content: [
              { type: "text", text: contentMessage },
              {
                type: "image_url",
                image_url: {
                  url: `${convertedImageUrl}`,
                },
              },
            ],
          },
        ],
      });

      generatedPrompt = completion.choices[0].message.content;
      console.log("Generated prompt:", generatedPrompt);

      // Check if the response contains the undesired phrase
      if (
        generatedPrompt.includes("I’m sorry") ||
        generatedPrompt.includes("I'm sorry") ||
        generatedPrompt.includes("I'm unable")
      ) {
        console.warn(
          `Attempt ${
            attempt + 1
          }: Received an undesired response from ChatGPT. Retrying...`
        );
        attempt++;
        // Optional: Add a delay before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay
        continue; // Retry the loop
      }

      // If the response is valid, break out of the loop
      break;
    } catch (error) {
      console.error("Error generating prompt:", error);
      attempt++;
      // Optional: Add a delay before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay
    }
  }

  if (
    generatedPrompt.includes("I’m sorry") ||
    generatedPrompt.includes("I'm sorry") ||
    generatedPrompt.includes("I'm unable")
  ) {
    throw new Error(
      "ChatGPT API could not generate a valid prompt after multiple attempts."
    );
  }

  return generatedPrompt;
}

// Replicate API'sine istek atarak görselleri oluşturma fonksiyonu
// Replicate API'sine istek atarak görselleri oluşturma fonksiyonu
async function generateImagesWithReplicate(
  prompt,
  hf_loras,
  categories,
  imageRatio,
  imageFormat,
  imageCount
) {
  try {
    // Başlık ekleme ve retouch kategorisi kontrolü
    let modifiedPrompt = `A photo of TOK ${prompt}`;
    if (categories === "retouch") {
      modifiedPrompt += " in the middle, white background";
    }

    // Default hf_loras değerlerini koşullu olarak ayarla
    let hf_loras_default = [];
    if (categories === "on_model") {
      hf_loras_default = ["VideoAditor/Flux-Lora-Realism"];
    } else if (categories === "retouch") {
      hf_loras_default = ["gokaygokay/Flux-White-Background-LoRA"];
    }

    const filteredHfLoras = Array.isArray(hf_loras)
      ? hf_loras.filter(
          (item) => typeof item === "string" && item.trim() !== ""
        )
      : [];

    // `filteredHfLoras` ve `hf_loras_default` değerlerini loglayarak kontrol et
    console.log("Filtered hf_loras:", filteredHfLoras);
    console.log("Default hf_loras:", hf_loras_default);

    // Eğer `filteredHfLoras` boşsa, sadece default değerleri kullan
    const combinedHfLoras =
      filteredHfLoras.length > 0
        ? [...hf_loras_default, ...filteredHfLoras]
        : hf_loras_default;

    console.log("Combined hf_loras:", combinedHfLoras);

    const output = await replicate.run(
      "lucataco/flux-dev-multi-lora:2389224e115448d9a77c07d7d45672b3f0aa45acacf1c5bcf51857ac295e3aec",
      {
        input: {
          prompt: modifiedPrompt,
          hf_loras: combinedHfLoras,
          lora_scales: [0.85],
          num_outputs: imageCount,
          aspect_ratio: imageRatio,
          output_format: imageFormat,
          guidance_scale: 3.5,
          output_quality: 100,
          prompt_strength: 1,
          num_inference_steps: 50,
          disable_safety_checker: true,
        },
      }
    );

    return output;
  } catch (error) {
    console.error("Error generating images:", error);
    throw error;
  }
}

// Ana POST endpoint'i
router.post("/generatePredictions", async (req, res) => {
  const {
    prompt,
    hf_loras,
    categories,
    userId,
    productId,
    product_main_image,
    customPrompt,
    extraPromptDetail,
    imageRatio,
    imageFormat,
    imageCount,
  } = req.body;

  try {
    // `customPrompt` değerinin tam olarak güncellenmesini sağlamak için beklet
    await new Promise((resolve) => setTimeout(resolve, 50));

    // GPT-4o ile yeni prompt oluşturma
    const generatedPrompt = await generatePrompt(
      product_main_image[0],
      prompt,
      customPrompt,
      extraPromptDetail,
      categories
    );

    // Replicate API ile görselleri oluşturma
    const output = await generateImagesWithReplicate(
      generatedPrompt,
      hf_loras,
      categories,
      imageRatio,
      imageFormat,
      imageCount
    );

    // Her bir görüntüyü ayrı bir kayıt olarak ekleyelim
    const insertPromises = output.map(async (imageUrl) => {
      const { error: insertError } = await supabase.from("predictions").insert({
        id: uuidv4(), // Yeni bir UUID oluştur
        user_id: userId,
        product_id: productId,
        prediction_image: imageUrl, // Tek bir resim URL'si
        categories,
        product_main_image,
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
    });

    // Tüm insert işlemlerini bekleyin
    await Promise.all(insertPromises);

    res.status(200).json({
      success: true,
      data: output,
    });
    console.log("Response Data:", output);
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({
      success: false,
      message: "Prediction generation failed",
    });
  }
});

module.exports = router;
