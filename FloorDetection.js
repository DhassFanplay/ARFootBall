let isPlaced = false;
let floorBottomY = null;

// Called by Unity to process webcam frame
window.ReceiveWebcamFrame = function (base64) {
    // Create image from base64 string
    const image = new Image();
    image.src = "data:image/jpeg;base64," + base64;

    image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = image.width;
        canvas.height = image.height;

        ctx.drawImage(image, 0, 0);

        try {
            let src = cv.imread(canvas);
            let gray = new cv.Mat();
            let edges = new cv.Mat();

            // Convert to grayscale
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Canny edge detection
            cv.Canny(gray, edges, 50, 150);

            // Morphological operations
            let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
            cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 5);
            cv.erode(edges, edges, kernel, new cv.Point(-1, -1), 3);

            // HoughLinesP for floor edge detection
            let lines = new cv.Mat();
            cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 20, 20, 10);

            let leftLines = [];
            let rightLines = [];

            for (let i = 0; i < lines.rows; ++i) {
                let x1 = lines.data32S[i * 4];
                let y1 = lines.data32S[i * 4 + 1];
                let x2 = lines.data32S[i * 4 + 2];
                let y2 = lines.data32S[i * 4 + 3];

                let dx = x2 - x1;
                let dy = y2 - y1;
                let length = Math.hypot(dx, dy);
                if (length < 20) continue;

                let slope = (dy / (dx || 0.0001)).toFixed(2);
                slope = parseFloat(slope);

                if (Math.abs(slope) < 0.1 || Math.abs(slope) > 10) continue;

                if (slope > 0) {
                    leftLines.push({ x1, y1, x2, y2 });
                } else {
                    rightLines.push({ x1, y1, x2, y2 });
                }
            }

            // Get best lines
            let bestLeft = getBestLine(leftLines);
            let bestRight = getBestLine(rightLines);

            if (bestLeft && bestRight) {
                let y_bottom_left = Math.max(bestLeft.y1, bestLeft.y2);
                let y_bottom_right = Math.max(bestRight.y1, bestRight.y2);

                // Estimate floor base point Y
                floorBottomY = (y_bottom_left + y_bottom_right) / 2;

                // Optional: Send position to Unity
                sendFloorPositionToUnity(floorBottomY);
            }

            // Cleanup OpenCV objects
            src.delete(); gray.delete(); edges.delete(); lines.delete();
        } catch (err) {
            console.error("OpenCV Error:", err);
        }
    };
};

function sendFloorPositionToUnity(floorBaseY) {
    if (!floorBaseY) return;

    const canvas = document.getElementById("canvas");
    const video = document.getElementById("video");

    if (!canvas || !video) return;

    const rows = canvas.height;

    // Normalize Y position (-1 to 1)
    let yNorm = (floorBaseY / rows) * 2 - 1;
    let zDepth = -1.5; // Fixed forward depth

    // Get camera forward direction
    const cameraEl = document.getElementById("camera");
    const cameraPos = cameraEl.object3D.position.clone();
    const cameraDir = new THREE.Vector3(0, 0, -1);
    cameraDir.applyQuaternion(cameraEl.object3D.quaternion);

    // Final position
    const finalX = cameraDir.x * 2;
    const finalY = -yNorm * 0.5;
    const finalZ = cameraDir.z * 2;

    // Send to Unity via UnityInstance.SendMessage
    if (window.UnityInstance && !isPlaced) {
        const positionString = `${finalX},${finalY},${finalZ}`;
        UnityInstance.SendMessage("FloorDetector", "OnReceiveFloorPosition", positionString);
    }
}

// Utility: Get longest line
function getBestLine(lines) {
    if (lines.length === 0) return null;
    return lines.reduce((a, b) => {
        let lenA = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
        let lenB = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
        return lenA > lenB ? a : b;
    });
}