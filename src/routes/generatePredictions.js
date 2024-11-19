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
  const MAX_RETRIES = 5;
  let attempt = 0;
  let generatedPrompt = "";

  // Prompt içeriğini oluşturmak için fonksiyon
  const generatePromptMessage = (imageUrl, extraPromptDetail, categories) => {
    const {
      modelGender,
      hairStyle,
      hairColor,
      mood,
      perspective,
      accessories,
      location,
      modelLocation,
      bodyShapes,
      poses,
      modelSkinTone,
      modelEthnicity,
      customPrompt,
    } = environmentContext || {};

    // Modelle ilgili ayrıntıları oluşturma
    let modelDescription = `The model is a ${modelGender || "person"}${
      modelSkinTone ? ` with a ${modelSkinTone} skin tone` : ""
    }${modelEthnicity ? ` of ${modelEthnicity} ethnicity` : ""}${
      hairStyle ? `, styled with ${hairStyle}` : ""
    }${hairColor ? `, with hair color in shades of ${hairColor}` : ""}.`;

    let modelPose = poses ? ` The model is posing ${poses.toLowerCase()}.` : "";

    let modelMood = mood
      ? ` The expression on the model's face conveys a ${mood.toLowerCase()} mood.`
      : "";

    let modelAccessories =
      Array.isArray(accessories) && accessories.length
        ? ` The model is also adorned with accessories like ${accessories.join(
            ", "
          )}.`
        : "";

    let modelLocationDescription = modelLocation
      ? ` The photoshoot is set in a ${modelLocation.toLowerCase()}, which provides an interesting backdrop that adds depth and character to the scene.`
      : "";

    let productBehaviorDescription = `Describe in detail how the product interacts with the model's movements, from the way the fabric flows to how structural elements add elegance. Highlight unique features such as textures, colors, and design patterns.`;

    let additionalDetails = extraPromptDetail
      ? ` Furthermore, incorporate these specific details about the product: ${extraPromptDetail}.`
      : "";

    let environmentDetail = location
      ? ` The environment around the model is set in a ${location.toLowerCase()}, adding contextual elements that enhance the visual narrative.`
      : "";

    // Prompt içeriği farklı kategorilere göre oluşturuluyor
    let contentMessage = "";

    if (categories === "on_model") {
      contentMessage = `Write a comprehensive and vivid English prompt that describes a product in a highly realistic and engaging way as it is showcased by a real model during a professional fashion photoshoot. Start by describing the model, their appearance, and posture: ${modelDescription}${modelPose}${modelMood}${modelAccessories}${modelLocationDescription}.

      Then, give an in-depth and highly descriptive portrayal of the product. Focus on the intricate details such as texture, material, structure, and design, using vivid and sensory language to make each feature come to life. Specify how the product accentuates the model’s features and enhances their appearance. ${productBehaviorDescription}${additionalDetails}

      Set the scene with a well-described backdrop that complements the product. ${environmentDetail} Use descriptive language that brings the entire scene to life, ensuring the product stands out yet is seamlessly integrated into the environment. Maintain a professional and refined tone throughout.`;
    } else if (categories === "photoshoot") {
      contentMessage = `Write a very long and detailed English prompt describing a product in a creative photoshoot scene without a model. Begin by setting the scene with a vivid description of the environment, such as the way natural light filters through leaves or how soft shadows fall over the product. Describe every aspect of the product meticulously, focusing on intricate patterns, materials, and unique features. ${environmentDetail}

      Use sensory language to bring the product to life: how the material feels to the touch, how the colors change under different lighting, and how the setting enhances the product's visual appeal. Make sure the description emphasizes the elegance and craftsmanship of the product without mentioning any human models. ${additionalDetails}`;
    } else if (categories === "retouch") {
      contentMessage = `Create a prompt that begins with a highly detailed and vivid description of the main product in the image. For example, if the main product is a white lace dress, describe it as follows: 'The product is an exquisite white lace dress featuring intricate floral lace patterns that run seamlessly across the bodice and flow into a delicate, scalloped hemline. The dress is adorned with subtle, almost ethereal embroidery that captures the light, giving it a soft shimmer.' Then, proceed with enhancement instructions to retouch the image: increase brightness, add natural shadows, and refine the texture for a clean and polished look. ${additionalDetails}

      Ensure the focus remains solely on the product, providing specific instructions to improve its appearance against a neutral or white background. Do not include any references to models or scenes.`;
    }

    return contentMessage;
  };

  // While döngüsü ile prompt'u oluşturmayı deneyin
  while (attempt < MAX_RETRIES) {
    try {
      // Prompt içeriğini oluştur
      const contentMessage = generatePromptMessage(
        imageUrl,
        extraPromptDetail,
        categories
      );

      // OpenAI API isteği
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a prompt engineer" },
          {
            role: "user",
            content: contentMessage,
          },
        ],
      });

      generatedPrompt = completion.choices[0].message.content;
      console.log("Generated prompt:", generatedPrompt);

      // Eğer istemediğimiz yanıt varsa yeniden dene
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
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 saniye gecikme
        continue;
      }

      // Geçerli yanıtı aldık, döngüyü kır
      break;
    } catch (error) {
      console.error("Error generating prompt:", error);
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 saniye gecikme
    }
  }

  // Hala geçerli bir yanıt yoksa hata at
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
      categories,
      environmentContext
    );

    // Eğer prompt oluşturulmadıysa, istek atma
    if (!generatedPrompt) {
      throw new Error("Prompt generation failed.");
    }

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
