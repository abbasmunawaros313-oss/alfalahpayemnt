import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// CRITICAL: Load environment variables FIRST
dotenv.config();

// Now dynamically import routes after environment variables are loaded
const { default: alfa } = await import("./routes/alfa.js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/alfa", alfa);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
