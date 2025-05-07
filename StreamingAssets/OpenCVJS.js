import {
    FilesetResolver,
    PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
const image = new Image();
image.crossOrigin = "anonymous";

// DEBUG helper
const debug = (msg) => {
    if (!window.debugDiv) {
        window.debugDiv = document.createElement("div");
        window.debugDiv.style.position = "absolute";
        window.debugDiv.style.bottom = "10px";
        window.debugDiv.style.left = "10px";
        window.debugDiv.style.background = "rgba(0,0,0,0.7)";
        window.debugDiv.style.color = "lime";
        window.debugDiv.style.padding = "6px";
        window.debugDiv.style.fontFamily = "monospace";
        window.debugDiv.style.zIndex = 10000;
        document.body.appendChild(window.debugDiv);
    }
    window.debugDiv.innerText = msg;
};

// Load MediaPipe + model
debug("Loading model...");
const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");

const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
    },
    runningMode: "VIDEO",
    numPoses: 1
});


debug("Model loaded.");

// Called from Unity with base64 image
window.ReceiveWebcamFrame = async (base64) => {
    console.log("Frame received");

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = "data:image/jpeg;base64," + base64;

    image.onload = async () => {
        console.log("Image loaded", image.width, image.height); //  Add this

        if (image.width === 0 || image.height === 0) {
            console.warn("Image has zero size, skipping");
            return;
        }
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        const result = await landmarker.detectForVideo(canvas, performance.now());
        console.log("Detection result:", result);

        if (result.landmarks?.length > 0) {
            const leftFoot = result.landmarks[0][30]; // index 31 is left foot
            console.log("Left foot coords:", leftFoot);
            if (window.unityInstance) {
                const footData = {
                    x: leftFoot.x,
                    y: leftFoot.y
                };
                window.unityInstance.SendMessage("FootCube", "OnReceiveFootPosition", JSON.stringify(footData));

            }
        } else {
            console.warn("No pose detected.");
        }
    };

    image.onerror = (err) => {
        console.error("Error loading image", err);
    };
};
