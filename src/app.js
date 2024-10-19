const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const imageRoutes = require("./routes/imageRoutes");
const backgroundGeneratorRouter = require("./routes/backgroundGenerator");
const generateFirstShootRouter = require("./routes/generateFirstShoot");
const generatePhotoshootRouter = require("./routes/generatePhotoshoot");
const getModelRouter = require("./routes/getModel");
const listTraingsRouter = require("./routes/listModels"); // Yeni eklenen route
const getTraining = require("./routes/getTraining");

const app = express();

app.use(cors());

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", backgroundGeneratorRouter);
app.use("/api/images", imageRoutes);
app.use("/api/generateFirstShoot", generateFirstShootRouter);
app.use("/api/generatePhotoshoot", generatePhotoshootRouter);
app.use("/api/getModel", getModelRouter);
app.use("/api/listTrainings", listTraingsRouter);
app.use("/api/getTraining", getTraining);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
