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
      convertedImageUrl = JSON.parse(rawImageString)[0]; // JSON string içindeki URL'yi ayıkla
      console.log("Converted Image URL:", convertedImageUrl);
    } catch (error) {
      console.error("Error parsing image URL:", error);
      convertedImageUrl = rawImageString; // Hata durumunda orijinal stringi kullan
    }

    console.log("Converted Image URL:", convertedImageUrl);

    if (categories === "on_model") {
      contentMessage = `Please write a very long and detailed English prompt describing a product as if it is being showcased by a real model in a professional fashion photoshoot. Begin with a vivid and extensive description of the model wearing the product, including their posture, expression, and how the product accentuates their features and movements. For example, describe how a white lace dress flows gracefully around the model's figure, with intricate floral patterns that shimmer softly in the light, emphasizing the delicacy of the lace.\n\nDescribe the setting of the photoshoot, such as natural light streaming through large windows or an outdoor garden with a lush, green backdrop that contrasts with the product. Explain how the lighting creates an ethereal or dramatic effect, enhancing the product's features. Specify the camera angles according to the type of product being showcased: if the product is eyewear, focus on angles that highlight the model's face and the details of the glasses; if it is footwear, use low-angle shots that emphasize the shoes on the model’s feet, showing how they fit and move.\n\nInclude descriptions of how the product behaves in motion, such as how the fabric flows with the model's movements, or how details like a delicate hemline sway gently, adding to its timeless charm. Mention every element of the product in detail, from the lace trim around the neckline to shimmering embroidery that exudes luxury.\n\n${
        environmentContext
          ? `Use the following environment context to set the scene: ${environmentContext}.`
          : ""
      }\n\nEnsure the description thoroughly captures the elegance and visual appeal of the product on the model. Adjust the description to highlight how the product enhances the model’s appearance, making the scene engaging and vivid. Specify camera angles tailored to the product, ensuring they effectively showcase its unique features and design. ${
        extraPromptDetail
          ? `Incorporate these additional details for the model into the prompt: ${extraPromptDetail}`
          : ""
      }`;
    } else if (categories === "photoshoot") {
      contentMessage = `Write a very long prompt in English that provides a highly detailed and vivid description of the item, focusing on highlighting it in a creative photoshoot scene with captivating angles and an atmosphere that draws the viewer in. Begin by setting the scene: describe the environment in exquisite detail, such as the way sunlight filters through the leaves of a lush garden, casting dappled light on the product, or the soft shadows. Explain how this setting complements the product, crafting a visual narrative that engages the audience's attention.\n\nDescribe every aspect of the item meticulously. For example, if it is a unique ceramic vase, detail how the light reflects off its glossy surface or how the texture of the ceramic appears under soft shadows. Highlight any intricate patterns or subtle design features that make the item stand out, using sensory language to bring these details to life vividly.\n\n${
        environmentContext
          ? `Base the scene and all descriptive details on the provided environment context. These details may have been provided in different languages, so translate and write them in English in your prompt: ${environmentContext}.`
          : ""
      }\n\nBring the environment to life with rich sensory details: describe the interplay of light and shadow, the textures of the surroundings, and how these elements interact with the product. Paint a vivid image of how the product fits into or stands out in the scene. Elaborate on how the product's materials feel to the touch, how it interacts with the environment, and how its colors change under different lighting conditions. Use language that effectively conveys the mood and setting to evoke emotions and spark the viewer’s imagination.\n\nDo not describe the product as being worn or used by a model. Instead, ensure that the item is presented in the environment on its own, with the background being an AI-generated setting that complements the product's characteristics. ${
        extraPromptDetail
          ? `Include these additional details to describe the item in the prompt: ${extraPromptDetail}`
          : ""
      }`;
    } else if (categories === "retouch") {
      contentMessage = `Create a prompt that begins with a highly detailed and vivid description of the main product in the image. For instance, if the main product is a white lace dress, describe it as follows: 'The product is an exquisite white lace dress featuring intricate floral lace patterns that run seamlessly across the bodice and flow into a delicate, scalloped hemline. The dress is adorned with subtle, almost ethereal embroidery that captures the light, giving it a soft shimmer. Its elegant neckline is framed with fine lace trim, and the fitted bodice accentuates the waist before cascading into a graceful, flowing skirt. The fabric's texture is both soft and structured, with each lace detail carefully woven to create a harmonious and luxurious look. The delicate sleeves add a touch of romance, while the overall silhouette is designed to drape beautifully, creating a captivating and timeless appeal.' Then, proceed with the enhancement instructions: increase the dress's brightness and clarity to make the intricate lace patterns and embroidery stand out, add natural shadows to accentuate its shape, and improve the texture to emphasize the fabric’s delicate yet structured feel. Soften the edges of the dress to ensure it blends smoothly with a pure white background. Reduce any reflections on the fabric to maintain an authentic look and adjust the colors for perfect vibrancy. Remove any dust or imperfections to present the dress flawlessly. Make sure the entire prompt is written as a cohesive and continuous piece of text. ${
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

    const generatedPrompt = completion.choices[0].message.content;
    console.log("Generated prompt:", generatedPrompt);

    // ChatGPT API'sinden "I'm sorry, I can't assist with that." yanıtı dönerse
    if (generatedPrompt.includes("I’m sorry, I can’t assist with that")) {
      console.error("ChatGPT could not generate a prompt.");
      throw new Error("ChatGPT API could not generate a prompt.");
    }

    return generatedPrompt;
  } catch (error) {
    console.error("Error generating prompt:", error);
    throw error;
  }
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
          lora_scales: [0.8],
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
