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
      contentMessage = `I would like you to write a very long English prompt in a style that provides a very detailed and well-explained description of this product. Please write the prompt as if you are describing this item on a real model.  Include all details regarding the model and setting in the prompt as well.${
        environmentContext
          ? ` Base the scene and all descriptive details on the provided environment context: ${environmentContext}.`
          : ""
      } Describe every detail thoroughly, presenting it as if it were being worn by a real model in a professional fashion photoshoot. Ensure the prompt captures the aesthetic, elegance, and visual appeal suitable for a model photo. Adjust the camera perspective according to the product.${
        extraPromptDetail
          ? `\nManken için olan Bu detayları da mutlaka prompta ekle ${extraPromptDetail}`
          : ""
      }`;
    } else if (categories === "photoshoot") {
      contentMessage = `Write a very long prompt in English that provides a highly detailed and vivid description of the item. Imagine a creative photoshoot scene for this product, focusing on highlighting the item with captivating angles and an atmosphere that draws the viewer in.${
        environmentContext
          ? ` Base the scene and all descriptive details on the provided environment context. 
These are the details. The user may have written these details in different languages. Write these details in English in the prompt you will write: ${environmentContext}.`
          : ""
      } Ensure every aspect of the item is described meticulously to fully capture its unique appeal and characteristics. As you describe, bring the environment to life with rich sensory details—consider the quality of light, shadows, textures, and any relevant background elements. Paint a clear image of how the product interacts with its surroundings, whether it's blending into a scene or standing out as the focal point. Use language that conveys the mood and setting effectively to evoke emotions and engage the viewer’s imagination. ${
        extraPromptDetail
          ? ` Manken için olan Bu detayları da mutlaka prompta ekle ${extraPromptDetail}`
          : ""
      }`;
    } else if (categories === "retouch") {
      contentMessage = `Write a very long prompt in English that provides a highly detailed description of the product. ${
        extraPromptDetail
          ? ` Manken için olan Bu detayları da mutlaka prompta ekle ${extraPromptDetail}`
          : ""
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
          lora_scales: [0.85],
          num_outputs: imageCount,
          aspect_ratio: imageRatio,
          output_format: imageFormat,
          guidance_scale: 3.5,
          output_quality: 100,
          prompt_strength: 1,
          num_inference_steps: 28,
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
