window.onUnityFrame = async function (base64) {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + base64;
    await img.decode();

    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = img.width;
    videoCanvas.height = img.height;
    const ctx = videoCanvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const input = tf.browser.fromPixels(videoCanvas);
    const poses = await detector.estimatePoses(input);
    input.dispose();

    if (poses.length > 0) {
        const keypoints = poses[0].keypoints;
        const left = keypoints.find(p => p.name === "left_ankle");
        const right = keypoints.find(p => p.name === "right_ankle");

        const result = {
            positions: [
                { x: left?.x || 0, y: left?.y || 0 },
                { x: right?.x || 0, y: right?.y || 0 }
            ]
        };

        const json = JSON.stringify(result);
        if (window.unityInstance) {
            unityInstance.SendMessage("CameraStreamer", "ReceiveFootPosition", json);
        }
    }
};
