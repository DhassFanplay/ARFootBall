const detectorPromise = (async () => {
    console.log("[DEBUG] Initializing MoveNet detector...");
    await tf.setBackend("webgl");
    await tf.ready();
    const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER
    });
    console.log("[DEBUG] Detector ready.");
    return detector;
})();

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

window.ReceiveWebcamFrame = async (base64) => {
    const detector = await detectorPromise;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = "data:image/jpeg;base64," + base64;

    image.onload = async () => {
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        console.log("[DEBUG] Image loaded. Estimating poses...");
        const poses = await detector.estimatePoses(canvas);
        if (poses.length === 0) {
            console.warn("[DEBUG] No poses detected.");
            return;
        }

        const keypoints = poses[0].keypoints;

        console.log("[DEBUG] Keypoints received:", keypoints);

        const leftAnkle = keypoints[15];  // left ankle index
        const rightAnkle = keypoints[16]; // right ankle index

        console.log("[DEBUG] Left Ankle:", leftAnkle);
        console.log("[DEBUG] Right Ankle:", rightAnkle);

        const foot = (leftAnkle?.score ?? 0) > (rightAnkle?.score ?? 0) ? leftAnkle : rightAnkle;

        if (foot && foot.score > 0.3) {
            const normalized = {
                x: foot.x / canvas.width,
                y: foot.y / canvas.height
            };
            console.log("[DEBUG] Sending foot position to Unity:", normalized);
            if (window.unityInstance) {
                window.unityInstance.SendMessage("FootCube", "OnReceiveFootPosition", JSON.stringify(normalized));
            } else {
                console.warn("[DEBUG] Unity instance not found.");
            }
        } else {
            console.log("[DEBUG] Foot score too low or undefined.");
        }
    };
};
