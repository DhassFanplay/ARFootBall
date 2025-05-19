// Global references
let isCameraReady = false;
let isDetectionManagerReady = false;
let gl = null;

// Called from Unity
window.cameraReady = function () {
    isCameraReady = true;
    gl = unityInstance.Module.ctx;
};

window.detectionManagerReady = function () {
    isDetectionManagerReady = true;
};

function createUnityMatrix(el) {
    const m = el.matrix.clone();
    const zFlipped = new THREE.Matrix4().makeScale(1, 1, -1).multiply(m);
    return zFlipped.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
}

AFRAME.registerComponent('cameratransform', {
    tock: function (time, timeDelta) {
        let camtr = new THREE.Vector3();
        let camro = new THREE.Quaternion();
        let camsc = new THREE.Vector3();

        this.el.object3D.matrix.clone().decompose(camtr, camro, camsc);

        const projection = this.el.components.camera.camera.projectionMatrix.clone();

        const posCam = camtr.toArray();
        const rotCam = camro.toArray();
        const projCam = projection.elements;

        if (isCameraReady) {
            unityInstance.SendMessage("Main Camera", "setProjection", JSON.stringify(projCam));
            unityInstance.SendMessage("Main Camera", "setPosition", JSON.stringify(posCam));
            unityInstance.SendMessage("Main Camera", "setRotation", JSON.stringify(rotCam));

            const w = window.innerWidth;
            const h = window.innerHeight;
            unityInstance.SendMessage("Canvas", "setSize", `${w},${h}`);
        }

        if (gl != null) {
            gl.dontClearOnFrameStart = true;
        }
    }
});

AFRAME.registerComponent('markercontroller', {
    schema: {
        name: { type: 'string' }
    },
    tock: function (time, timeDelta) {
        let position = new THREE.Vector3();
        let rotation = new THREE.Quaternion();
        let scale = new THREE.Vector3();

        createUnityMatrix(this.el.object3D).decompose(position, rotation, scale);

        const serializedInfos = `${this.data.name},${this.el.object3D.visible},${position.toArray()},${rotation.toArray()},${scale.toArray()}`;

        if (isDetectionManagerReady) {
            unityInstance.SendMessage("DetectionManager", "markerInfos", serializedInfos);
        }
    }
});