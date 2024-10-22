const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const imageRoutes = require("./routes/imageRoutes");
const backgroundGeneratorRouter = require("./routes/backgroundGenerator");
const generateFirstShootRouter = require("./routes/generateFirstShoot");
const generatePhotoshootRouter = require("./routes/generatePhotoshoot");
const getModelRouter = require("./routes/getModel");
const listTraingsRouter = require("./routes/listModels");
const getTraining = require("./routes/getTraining");
const updateCreditRouter = require("./routes/updateCredit");
const getUserRouter = require("./routes/getUser");
const notificationRoutes = require("./routes/notificationRoutes");

// Yeni eklenen route'lar
const addProductRouter = require("./routes/addProduct"); // Ürün ekleme route'u
const getUserProductRouter = require("./routes/getUserProduct"); // Ürün çekme route'u
const removeBgRouter = require("./routes/removeBg"); // Remove BG route'unu ekliyoruz
const uploadImageRouter = require("./routes/uploadImage");
const generateTrain = require("./routes/generateTrain");

const app = express();

// CORS ve body parser middleware'leri
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Mevcut route'lar
app.use("/api", backgroundGeneratorRouter);
app.use("/api/images", imageRoutes);
app.use("/api/generateFirstShoot", generateFirstShootRouter);
app.use("/api/generatePhotoshoot", generatePhotoshootRouter);
app.use("/api/getModel", getModelRouter);
app.use("/api/listTrainings", listTraingsRouter);
app.use("/api/getTraining", getTraining);
app.use("/api", updateCreditRouter);
app.use("/api", getUserRouter);
app.use("/api", notificationRoutes);
app.use("/api", uploadImageRouter);
app.use("/api", generateTrain);
// Yeni eklenen route'lar
app.use("/api", addProductRouter); // Ürün ekleme route'u
app.use("/api", getUserProductRouter); // Ürün çekme route'u
app.use("/api", removeBgRouter); // Remove BG route'u

// Sunucuyu başlatıyoruz
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
