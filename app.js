// Global variables
let isCameraReady = false;
let gl = null;
// Global variables
let floorBottomY = null;
let floorBaseZ = -1.5; // Fixed depth in front of camera
let currentFloorPosition = null;

const floorHeightThreshold = 0.7; // Only accept if floor detected
const floorDepthOffset = 0.5;

// Called by Unity to process base64 image
window.ReceiveWebcamFrameFloor = function (base64) {
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

            // HoughLinesP for floor lines
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
                let length = Math.sqrt(dx * dx + dy * dy);
                if (length < 20) continue;

                let slope = (dy / (dx || 0.0001)).toFixed(2);
                if (Math.abs(slope) < 0.1 || Math.abs(parseFloat(slope)) > 10) continue;

                if (parseFloat(slope) > 0) {
                    leftLines.push({ x1, y1, x2, y2 });
                } else {
                    rightLines.push({ x1, y1, x2, y2 });
                }
            }

            let bestLeft = getBestLine(leftLines);
            let bestRight = getBestLine(rightLines);

            if (bestLeft && bestRight) {
                // Estimate floor Y
                floorBottomY = (bestLeft.y2 + bestRight.y1) / 2;

                // Normalize floor height
                let normalizedY = (floorBottomY / canvas.height) * 2 - 1;
                let yUnity = -normalizedY * 0.5;

                // Get camera forward direction
                const cameraEl = document.getElementById('camera');
                if (!cameraEl) return;

                const camDir = new THREE.Vector3(0, 0, -1);
                camDir.applyQuaternion(cameraEl.object3D.quaternion);

                // Final position
                currentFloorPosition = {
                    x: camDir.x * 2,
                    y: yUnity,
                    z: camDir.z * 2
                };
            }

            // Cleanup
            if (src) src.delete();
            if (gray) gray.delete();
            if (edges) edges.delete();
            if (lines) lines.delete();
        } catch (err) {
            console.error("OpenCV Error:", err);
        }
    };
};

// Function called by Unity button click
window.placeObject = function () {
    const cube = document.getElementById('placedCube');

    if (!currentFloorPosition) {
        alert("No floor detected yet.");
        return;
    }

    cube.setAttribute('position', {
        x: currentFloorPosition.x,
        y: currentFloorPosition.y,
        z: currentFloorPosition.z
    });

    cube.setAttribute('visible', true); // Optional: show for debug

    // Send to Unity
    sendPositionToUnity(currentFloorPosition);
};

// Send cube position to Unity continuously or on demand
function sendPositionToUnity(position) {
    if (!window.UnityInstance) return;

    const posString = `${position.x},${position.y},${position.z}`;
    UnityInstance.SendMessage("FloorDetector", "OnReceiveFloorPosition", posString);
}

// Utility: Get longest line
function getBestLine(lines) {
    if (!lines || lines.length === 0) return null;
    return lines.reduce((a, b) => {
        let lenA = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
        let lenB = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
        return lenA > lenB ? a : b;
    });
}
// Called from Unity when camera is ready
window.cameraReady = function () {
    isCameraReady = true;
    startAFrameScene();
};

function startAFrameScene() {
    console.log("📷 Initializing A-Frame AR scene...");

    const arScene = document.createElement('a-scene');
    arScene.setAttribute("embedded", "");
    arScene.setAttribute("arjs", "sourceType: webcam; debugUIEnabled: false");
    arScene.setAttribute("vr-mode-ui", "enabled: false");
    arScene.style.zIndex = "1";
    arScene.style.position = "absolute";
    arScene.style.top = "0";
    arScene.style.left = "0";
    arScene.style.width = "100vw";
    arScene.style.height = "100vh";

    // Add camera
    const cameraEntity = document.createElement('a-entity');
    cameraEntity.setAttribute('id', 'camera');
    cameraEntity.setAttribute('camera', '');
    cameraEntity.setAttribute('look-controls', '');
    cameraEntity.setAttribute('cameratransform', ''); // Custom component

    arScene.appendChild(cameraEntity);
    document.body.appendChild(arScene);
}

// Component to send camera data to Unity every frame
AFRAME.registerComponent('cameratransform', {
    schema: {},

    tock: function () {
        const el = this.el;
        const camera = el.components.camera.camera;

        if (!camera) return;

        // Get camera position and rotation
        let position = new THREE.Vector3();
        let quaternion = new THREE.Quaternion();
        let scale = new THREE.Vector3();

        el.object3D.matrix.clone().decompose(position, quaternion, scale);

        // Convert to array string
        const posStr = position.toArray().join(",");
        const rotStr = quaternion.toArray().join(",");
        const projStr = [...camera.projectionMatrix.elements].join(",");

        // Send to Unity
        if (window.UnityInstance && window.isCameraReady) {
            UnityInstance.SendMessage("Main Camera", "SetPosition", posStr);
            UnityInstance.SendMessage("Main Camera", "SetRotation", rotStr);
            UnityInstance.SendMessage("Main Camera", "SetProjection", projStr);

            // Optional: Send canvas size
            const canvas = document.getElementsByTagName('canvas')[0];
            if (canvas) {
                const w = canvas.width;
                const h = canvas.height;
                UnityInstance.SendMessage("Canvas", "SetSize", `${w},${h}`);
            }
        }

        // Prevent WebGL clear between Unity and A-Frame
        if (gl != null) {
            gl.dontClearOnFrameStart = true;
        }
    }
});