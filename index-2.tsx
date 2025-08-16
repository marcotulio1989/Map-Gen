/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

type RockData = {
  model: THREE.Group;
  name: string;
  size: THREE.Vector3;
  box: THREE.Box3;
};

interface ContourPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  angle: number;
}

class IslandGeneratorApp {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private fbxLoader: FBXLoader;
  private objLoader: OBJLoader;
  private rockModels: RockData[] = [];
  private grassModel: THREE.Group | null = null;
  private group: THREE.Group; // Group to hold all arranged rocks
  private foliageGroup: THREE.Group; // Group to hold foliage
  private contourLine: THREE.Line | null = null;
  private innerContourLine: THREE.Line | null = null;
  private outerContourLine: THREE.Line | null = null;
  private islandSurface: THREE.Mesh | null = null;
  private groundCoverMesh: THREE.Mesh | null = null;
  private perlin: ImprovedNoise;

  private sandMaterial: THREE.MeshStandardMaterial;
  private rockMaterial: THREE.MeshStandardMaterial;
  private groundCoverMaterial: THREE.MeshStandardMaterial;

  // DOM Elements
  private rockModelInput: HTMLInputElement;
  private fileCountDisplay: HTMLElement;
  private generateButton: HTMLButtonElement;
  private loadingOverlay: HTMLElement;
  private islandRadiusInput: HTMLInputElement;
  private islandRadiusValue: HTMLElement;
  private shorelineOffsetInput: HTMLInputElement;
  private shorelineOffsetValue: HTMLElement;
  private contourHeightInput: HTMLInputElement;
  private contourHeightValue: HTMLElement;
  private noiseStrengthInput: HTMLInputElement;
  private noiseStrengthValue: HTMLElement;
  private noiseScaleInput: HTMLInputElement;
  private noiseScaleValue: HTMLElement;
  private surfaceSmoothingInput: HTMLInputElement;
  private surfaceSmoothingValue: HTMLElement;
  private grassModelInput: HTMLInputElement;
  private grassModelButton: HTMLButtonElement;
  private grassModelFilename: HTMLElement;
  private grassDensityInput: HTMLInputElement;
  private grassDensityValue: HTMLElement;
  private foliageWidthInput: HTMLInputElement;
  private foliageWidthValue: HTMLElement;
  private foliageMaxSlopeInput: HTMLInputElement;
  private foliageMaxSlopeValue: HTMLElement;
  private foliageCoordinatesList: HTMLElement;
  private maxFoliageCountInput: HTMLInputElement;
  private foliageScaleInput: HTMLInputElement;
  private foliageScaleValue: HTMLElement;

  // Texture inputs
  private sandAlbedoInput: HTMLInputElement;
  private sandNormalInput: HTMLInputElement;
  private sandRoughnessInput: HTMLInputElement;
  private rockAlbedoInput: HTMLInputElement;
  private rockNormalInput: HTMLInputElement;
  private rockRoughnessInput: HTMLInputElement;
  private groundCoverAlbedoInput: HTMLInputElement;
  private groundCoverNormalInput: HTMLInputElement;
  private groundCoverRoughnessInput: HTMLInputElement;


  constructor() {
    this.perlin = new ImprovedNoise();
    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
    this.initScene();
    
    // Initialize materials with fallback colors.
    this.sandMaterial = new THREE.MeshStandardMaterial({
        color: 0xC2B280,
        side: THREE.DoubleSide,
        name: 'sand'
    });
    this.rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        name: 'rock'
    });
    this.groundCoverMaterial = new THREE.MeshStandardMaterial({
        color: 0x5C4033, // Dirt brown
        name: 'groundCover'
    });

    this.bindUI();
    this.addEventListeners();
    this.animate();
  }

  private initScene() {
    const canvas = document.querySelector('#c') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.camera.position.set(0, 25, 50);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 2, 0);
    this.controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(5, 10, 7.5);
    this.scene.add(directionalLight);
    
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    
    this.foliageGroup = new THREE.Group();
    this.scene.add(this.foliageGroup);


    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private bindUI() {
    this.rockModelInput = document.getElementById('rock-model-input') as HTMLInputElement;
    this.fileCountDisplay = document.getElementById('file-count') as HTMLElement;
    this.generateButton = document.getElementById('generate-button') as HTMLButtonElement;
    this.loadingOverlay = document.getElementById('loading-overlay') as HTMLElement;
    this.islandRadiusInput = document.getElementById('island-radius-input') as HTMLInputElement;
    this.islandRadiusValue = document.getElementById('island-radius-value') as HTMLElement;
    this.shorelineOffsetInput = document.getElementById('shoreline-offset-input') as HTMLInputElement;
    this.shorelineOffsetValue = document.getElementById('shoreline-offset-value') as HTMLElement;
    this.contourHeightInput = document.getElementById('contour-height-input') as HTMLInputElement;
    this.contourHeightValue = document.getElementById('contour-height-value') as HTMLElement;
    this.noiseStrengthInput = document.getElementById('noise-strength-input') as HTMLInputElement;
    this.noiseStrengthValue = document.getElementById('noise-strength-value') as HTMLElement;
    this.noiseScaleInput = document.getElementById('noise-scale-input') as HTMLInputElement;
    this.noiseScaleValue = document.getElementById('noise-scale-value') as HTMLElement;
    this.surfaceSmoothingInput = document.getElementById('surface-smoothing-input') as HTMLInputElement;
    this.surfaceSmoothingValue = document.getElementById('surface-smoothing-value') as HTMLElement;
    
    // Foliage
    this.grassModelButton = document.getElementById('grass-model-button') as HTMLButtonElement;
    this.grassModelInput = document.getElementById('grass-model-input') as HTMLInputElement;
    this.grassModelFilename = document.getElementById('grass-model-filename') as HTMLElement;
    this.grassDensityInput = document.getElementById('grass-density-input') as HTMLInputElement;
    this.grassDensityValue = document.getElementById('grass-density-value') as HTMLElement;
    this.foliageWidthInput = document.getElementById('foliage-width-input') as HTMLInputElement;
    this.foliageWidthValue = document.getElementById('foliage-width-value') as HTMLElement;
    this.foliageMaxSlopeInput = document.getElementById('foliage-max-slope-input') as HTMLInputElement;
    this.foliageMaxSlopeValue = document.getElementById('foliage-max-slope-value') as HTMLElement;
    this.foliageCoordinatesList = document.getElementById('foliage-coordinates-list') as HTMLElement;
    this.maxFoliageCountInput = document.getElementById('max-foliage-count-input') as HTMLInputElement;
    this.foliageScaleInput = document.getElementById('foliage-scale-input') as HTMLInputElement;
    this.foliageScaleValue = document.getElementById('foliage-scale-value') as HTMLElement;

    // PBR Texture Inputs
    this.sandAlbedoInput = document.getElementById('sand-albedo-input') as HTMLInputElement;
    this.sandNormalInput = document.getElementById('sand-normal-input') as HTMLInputElement;
    this.sandRoughnessInput = document.getElementById('sand-roughness-input') as HTMLInputElement;
    this.rockAlbedoInput = document.getElementById('rock-albedo-input') as HTMLInputElement;
    this.rockNormalInput = document.getElementById('rock-normal-input') as HTMLInputElement;
    this.rockRoughnessInput = document.getElementById('rock-roughness-input') as HTMLInputElement;
    this.groundCoverAlbedoInput = document.getElementById('ground-cover-albedo-input') as HTMLInputElement;
    this.groundCoverNormalInput = document.getElementById('ground-cover-normal-input') as HTMLInputElement;
    this.groundCoverRoughnessInput = document.getElementById('ground-cover-roughness-input') as HTMLInputElement;
  }
  
  private setupUploadButton(
    buttonId: string,
    inputElement: HTMLInputElement,
    filenameId: string,
    material: THREE.MeshStandardMaterial,
    mapType: 'map' | 'normalMap' | 'roughnessMap'
  ) {
    const button = document.getElementById(buttonId) as HTMLButtonElement;
    const filenameDisplay = document.getElementById(filenameId) as HTMLElement;
    
    if (button && inputElement && filenameDisplay) {
        button.addEventListener('click', () => inputElement.click());
        
        inputElement.addEventListener('change', (e) => {
            if (inputElement.files && inputElement.files.length > 0) {
                filenameDisplay.textContent = inputElement.files[0].name;
                this.handleTextureUpload(e, material, mapType);
            } else {
                filenameDisplay.textContent = 'No file chosen';
            }
        });
    }
  }

  private addEventListeners() {
    this.rockModelInput.addEventListener('change', this.handleFileSelect.bind(this));
    this.generateButton.addEventListener('click', this.generateIsland.bind(this));
    
    this.islandRadiusInput.addEventListener('input', () => {
        this.islandRadiusValue.textContent = this.islandRadiusInput.value;
    });

    this.shorelineOffsetInput.addEventListener('input', () => {
        this.shorelineOffsetValue.textContent = this.shorelineOffsetInput.value;
    });

    this.contourHeightInput.addEventListener('input', () => {
        this.contourHeightValue.textContent = parseFloat(this.contourHeightInput.value).toFixed(1);
    });

    this.noiseStrengthInput.addEventListener('input', () => {
      this.noiseStrengthValue.textContent = parseFloat(this.noiseStrengthInput.value).toFixed(2);
    });

    this.noiseScaleInput.addEventListener('input', () => {
        this.noiseScaleValue.textContent = parseFloat(this.noiseScaleInput.value).toFixed(3);
    });
    
    this.surfaceSmoothingInput.addEventListener('input', () => {
        this.surfaceSmoothingValue.textContent = this.surfaceSmoothingInput.value;
    });

    // Foliage Listeners
    this.grassModelButton.addEventListener('click', () => this.grassModelInput.click());
    this.grassModelInput.addEventListener('change', this.handleGrassModelSelect.bind(this));
    this.grassDensityInput.addEventListener('input', () => {
        this.grassDensityValue.textContent = this.grassDensityInput.value;
    });
    this.foliageWidthInput.addEventListener('input', () => {
        this.foliageWidthValue.textContent = parseFloat(this.foliageWidthInput.value).toFixed(1);
    });
    this.foliageMaxSlopeInput.addEventListener('input', () => {
        this.foliageMaxSlopeValue.textContent = this.foliageMaxSlopeInput.value;
    });
    this.foliageScaleInput.addEventListener('input', () => {
        this.foliageScaleValue.textContent = parseFloat(this.foliageScaleInput.value).toFixed(2);
    });

    // PBR Texture Upload Listeners
    this.setupUploadButton('sand-albedo-button', this.sandAlbedoInput, 'sand-albedo-filename', this.sandMaterial, 'map');
    this.setupUploadButton('sand-normal-button', this.sandNormalInput, 'sand-normal-filename', this.sandMaterial, 'normalMap');
    this.setupUploadButton('sand-roughness-button', this.sandRoughnessInput, 'sand-roughness-filename', this.sandMaterial, 'roughnessMap');
    
    this.setupUploadButton('rock-albedo-button', this.rockAlbedoInput, 'rock-albedo-filename', this.rockMaterial, 'map');
    this.setupUploadButton('rock-normal-button', this.rockNormalInput, 'rock-normal-filename', this.rockMaterial, 'normalMap');
    this.setupUploadButton('rock-roughness-button', this.rockRoughnessInput, 'rock-roughness-filename', this.rockMaterial, 'roughnessMap');
    
    this.setupUploadButton('ground-cover-albedo-button', this.groundCoverAlbedoInput, 'ground-cover-albedo-filename', this.groundCoverMaterial, 'map');
    this.setupUploadButton('ground-cover-normal-button', this.groundCoverNormalInput, 'ground-cover-normal-filename', this.groundCoverMaterial, 'normalMap');
    this.setupUploadButton('ground-cover-roughness-button', this.groundCoverRoughnessInput, 'ground-cover-roughness-filename', this.groundCoverMaterial, 'roughnessMap');
  }

    private handleTextureUpload(
        event: Event,
        material: THREE.MeshStandardMaterial,
        mapType: 'map' | 'normalMap' | 'roughnessMap'
    ) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            if (!dataUrl) return;

            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(dataUrl, (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;

                material[mapType] = texture;
                if(mapType === 'map') {
                  material.color.set(0xffffff); // Set color to white to show texture fully
                }
                material.needsUpdate = true;
            });
        };

        reader.readAsDataURL(file);
    }
  
  private handleGrassModelSelect(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) {
        this.grassModel = null;
        this.grassModelFilename.textContent = 'No file selected.';
        return;
    }
    
    const file = files[0];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension !== 'obj' && fileExtension !== 'fbx') {
        alert('Unsupported file type for grass model. Please use .obj or .fbx');
        this.grassModelFilename.textContent = 'Invalid file type.';
        this.grassModel = null;
        (event.target as HTMLInputElement).value = ''; // Reset input
        return;
    }

    this.grassModelFilename.textContent = file.name;
    this.showLoading(true, "Loading grass model...");

    const reader = new FileReader();

    reader.onload = (e) => {
        const contents = e.target?.result;
        if (!contents) {
            console.error('Failed to read grass model file.');
            this.showLoading(false);
            return;
        }
        
        try {
            let object: THREE.Group;

            if (fileExtension === 'obj' && typeof contents === 'string') {
                object = this.objLoader.parse(contents);
            } else if (fileExtension === 'fbx' && contents instanceof ArrayBuffer) {
                object = this.fbxLoader.parse(contents, '');
            } else {
                 throw new Error(`Internal error: Unsupported file type or content mismatch: ${fileExtension}`);
            }
            
            let hasGeometry = false;
            object.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    hasGeometry = true;
                }
            });

            if (!hasGeometry) {
                throw new Error('Parsed model contains no usable mesh geometry.');
            }

            object.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x4C7F3C,
                        roughness: 0.8,
                    });
                    child.castShadow = true;
                }
            });
            this.grassModel = object;
        } catch (error) {
            console.error(`Error parsing ${fileExtension.toUpperCase()} file:`, error);
            alert(`There was an error parsing the ${fileExtension.toUpperCase()} file. Check console for details.`);
            this.grassModel = null;
            this.grassModelFilename.textContent = 'Failed to load';
        } finally {
            this.showLoading(false);
        }
    };
    reader.onerror = (err) => {
        console.error('Error reading file:', err);
        alert(`Error reading file: ${file.name}`);
        this.showLoading(false);
    };

    if (fileExtension === 'obj') {
        reader.readAsText(file);
    } else if (fileExtension === 'fbx') {
        reader.readAsArrayBuffer(file);
    }
  }

  private async handleFileSelect(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) {
      this.rockModels = [];
      this.generateButton.disabled = true;
      this.fileCountDisplay.textContent = 'No files selected.';
      return;
    }
    
    this.showLoading(true, "Loading models...");
    this.rockModels = [];
    const loadPromises: Promise<void>[] = [];

    for (const file of files) {
      loadPromises.push(this.loadFile(file));
    }

    try {
      await Promise.all(loadPromises);
    } catch (error) {
      console.error('Error loading files:', error);
      alert('There was an error loading one or more model files. Check the console for details.');
    } finally {
      this.showLoading(false);
      const numFiles = this.rockModels.length;
      this.fileCountDisplay.textContent = numFiles > 0 ? `${numFiles} model${numFiles > 1 ? 's' : ''} loaded.` : 'No valid models selected.';
      this.generateButton.disabled = numFiles === 0;
    }
  }

  private loadFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const fileExtension = file.name.split('.').pop()?.toLowerCase();

        reader.onload = (e) => {
            const contents = e.target?.result;
            if (!contents) {
                return reject(new Error(`Failed to read file: ${file.name}`));
            }
            try {
                let object: THREE.Group;
                if (fileExtension === 'obj' && typeof contents === 'string') {
                    object = this.objLoader.parse(contents);
                } else if (fileExtension === 'fbx' && contents instanceof ArrayBuffer) {
                    object = this.fbxLoader.parse(contents, '');
                } else {
                    // This path should ideally not be taken due to the check below,
                    // but it's a safeguard.
                    console.warn(`Skipping file with unsupported type or content mismatch: ${file.name}`);
                    return resolve();
                }

                let hasGeometry = false;
                object.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        hasGeometry = true;
                    }
                });
                if (!hasGeometry) {
                    throw new Error(`Parsed model "${file.name}" contains no usable mesh geometry.`);
                }

                const box = new THREE.Box3().setFromObject(object);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                // Apply the current rock material (default color or user-uploaded)
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.material = this.rockMaterial;
                    }
                });
                
                this.rockModels.push({
                    model: object,
                    name: file.name,
                    size: size,
                    box: box,
                });
                resolve();
            } catch (error) {
                const e = error as Error;
                reject(new Error(`Failed to parse ${file.name}: ${e.message}`));
            }
        };
        reader.onerror = (err) => reject(new Error(`Error reading file ${file.name}: ${err}`));
        
        if (fileExtension === 'obj') {
            reader.readAsText(file);
        } else if (fileExtension === 'fbx') {
            reader.readAsArrayBuffer(file);
        } else {
            console.warn(`Skipping unsupported file type: ${file.name}`);
            resolve(); // Don't block other files from loading
        }
    });
  }
  
  /**
   * Generates a set of noise values for creating natural contours.
   * @param numPoints The number of noise values to generate.
   * @param phaseOffset A random offset to change the starting point of the noise.
   * @returns An array of normalized noise values.
   */
  private generateNoise(numPoints: number, phaseOffset: number): number[] {
      const noiseValues = new Array(numPoints).fill(0);
      const harmonics = [
          { freq: 1, amp: 1.0 },   // Base shape
          { freq: 2, amp: 0.5 },   // Medium details
          { freq: 5, amp: 0.25 },  // Finer details
          { freq: 9, amp: 0.125 }, // Very fine details
      ];

      let totalAmplitude = 0;
      harmonics.forEach(h => totalAmplitude += h.amp);

      for (const harmonic of harmonics) {
          const phase = phaseOffset + Math.random() * 2 * Math.PI;
          for (let i = 0; i < numPoints; i++) {
              const angle = (i / numPoints) * 2 * Math.PI;
              noiseValues[i] += Math.sin(angle * harmonic.freq + phase) * harmonic.amp;
          }
      }
      
      // Normalize to ensure the output is roughly within [-1, 1] for consistent irregularity
      for (let i = 0; i < numPoints; i++) {
          noiseValues[i] /= totalAmplitude;
      }

      return noiseValues;
  }

  /**
   * Applies a Simple Moving Average to the Y-values of a set of points.
   * @param points The input points.
   * @param windowSize The number of neighbors on each side to include in the average.
   * @returns A new array of points with smoothed Y-values.
   */
  private applySMA(points: THREE.Vector3[], windowSize: number): THREE.Vector3[] {
    if (windowSize === 0) {
        return points.map(p => p.clone()); // Return a copy if no smoothing
    }

    const smoothedPoints: THREE.Vector3[] = [];
    const numPoints = points.length;

    for (let i = 0; i < numPoints; i++) {
        let sumY = 0;
        let count = 0;
        for (let j = -windowSize; j <= windowSize; j++) {
            const index = (i + j + numPoints) % numPoints; // Wrap around for a closed loop
            sumY += points[index].y;
            count++;
        }
        
        const newPoint = points[i].clone();
        newPoint.y = sumY / count;
        smoothedPoints.push(newPoint);
    }

    return smoothedPoints;
  }

  private async generateIsland() {
    if (this.rockModels.length === 0) return;

    this.showLoading(true, "Generating Island...");
    this.generateButton.disabled = true;
    if (this.foliageCoordinatesList) {
        this.foliageCoordinatesList.textContent = 'Cleared. Waiting for generation...';
    }
    await new Promise(resolve => setTimeout(resolve, 20));

    try {
        if (this.contourLine) {
            this.scene.remove(this.contourLine);
            this.contourLine.geometry.dispose();
            (this.contourLine.material as THREE.Material).dispose();
            this.contourLine = null;
        }
        if (this.innerContourLine) {
            this.scene.remove(this.innerContourLine);
            this.innerContourLine.geometry.dispose();
            (this.innerContourLine.material as THREE.Material).dispose();
            this.innerContourLine = null;
        }
        if (this.outerContourLine) {
            this.scene.remove(this.outerContourLine);
            this.outerContourLine.geometry.dispose();
            (this.outerContourLine.material as THREE.Material).dispose();
            this.outerContourLine = null;
        }
        if (this.groundCoverMesh) {
            this.group.remove(this.groundCoverMesh);
            this.groundCoverMesh.geometry.dispose();
            (this.groundCoverMesh.material as THREE.Material).dispose();
            this.groundCoverMesh = null;
        }
        if (this.islandSurface) {
            this.group.remove(this.islandSurface);
            this.islandSurface.geometry.dispose();
            (this.islandSurface.material as THREE.Material).dispose();
            this.islandSurface = null;
        }
        this.group.clear();
        this.foliageGroup.clear();

        const baseRadius = parseFloat(this.islandRadiusInput.value);
        const shorelineOffset = parseFloat(this.shorelineOffsetInput.value);
        const baseHeight = parseFloat(this.contourHeightInput.value);
        const noiseStrength = parseFloat(this.noiseStrengthInput.value);
        const noiseScale = parseFloat(this.noiseScaleInput.value);
        const surfaceSmoothing = parseInt(this.surfaceSmoothingInput.value, 10);
        const foliageBandWidth = parseFloat(this.foliageWidthInput.value);
        
        // Sort models by size (volume of bounding box) to partition them.
        this.rockModels.sort((a, b) => {
            const volumeA = a.size.x * a.size.y * a.size.z;
            const volumeB = b.size.x * b.size.y * b.size.z;
            return volumeA - volumeB;
        });

        // Split models into "small" and "large" sets.
        const SMALL_ROCK_PERCENTILE = 0.4;
        let splitIndex = Math.max(1, Math.floor(this.rockModels.length * SMALL_ROCK_PERCENTILE));
        if (this.rockModels.length < 2) splitIndex = 1;

        const smallRockModels = this.rockModels.slice(0, splitIndex);
        let largeRockModels = this.rockModels.slice(splitIndex);

        // Ensure largeRockModels is never empty if we have models.
        if (largeRockModels.length === 0 && smallRockModels.length > 0) {
            largeRockModels = smallRockModels;
        }

        const irregularity = 0.25;
        const DENSITY_BASE_ROCKS = 75;
        const DENSITY_BASE_RADIUS = 20;
        const DENSITY_SCALE_POWER = 1;
        const densityCoefficient = DENSITY_BASE_ROCKS / Math.pow(DENSITY_BASE_RADIUS, DENSITY_SCALE_POWER);

        // --- Generate Large Rock Contour (Inner) ---
        const numLargeRocks = Math.max(3, Math.round(densityCoefficient * Math.pow(baseRadius, DENSITY_SCALE_POWER)));
        const largeRocksGroup = new THREE.Group();
        const innerContourData: ContourPoint[] = [];
        
        const largeRockClones = Array.from({ length: numLargeRocks }, (_, i) => {
            const source = largeRockModels[i % largeRockModels.length];
            return { ...source, model: source.model.clone(true) };
        }).sort(() => Math.random() - 0.5); // Shuffle

        const largeNoise = this.generateNoise(numLargeRocks, Math.random());

        for (let i = 0; i < numLargeRocks; i++) {
            const data = largeRockClones[i];
            const { model, box } = data;
            const angle = (i / numLargeRocks) * 2 * Math.PI;
            
            const noisyRadius = baseRadius * (1 + largeNoise[i] * irregularity);
            const x = Math.cos(angle) * noisyRadius;
            const z = Math.sin(angle) * noisyRadius;

            // Base position at y=0, used for placing small rocks later.
            const position = new THREE.Vector3(x, 0, z);
            const normal = new THREE.Vector3(x, 0, z).normalize();
            innerContourData.push({ position, normal, angle });
            
            model.position.set(x, -box.min.y, z);
            
            // Orient the rock to be tangential to the new ellipse shape
            const normalAngle = Math.atan2(z, x);
            model.rotation.y = -normalAngle + Math.PI / 2;

            // Re-apply the shared material to ensure texture updates are reflected
            model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = this.rockMaterial;
                }
            });

            largeRocksGroup.add(model);
        }
        this.group.add(largeRocksGroup);
        
        // --- Generate Surface Contour From Noise ---
        // The surface is now independent of the rock heights.
        const noisyContourPoints: THREE.Vector3[] = [];
        const numSurfacePoints = 128; // Higher resolution for a smoother surface boundary

        for (let i = 0; i < numSurfacePoints; i++) {
            const angle = (i / numSurfacePoints) * 2 * Math.PI;

            // Interpolate radial noise to maintain the island's irregular shape, matching the rocks
            const noiseProgress = (i / numSurfacePoints) * numLargeRocks;
            const index1 = Math.floor(noiseProgress);
            const index2 = (index1 + 1) % numLargeRocks;
            const lerpFactor = noiseProgress - index1;
            const interpolatedNoise = THREE.MathUtils.lerp(largeNoise[index1], largeNoise[index2], lerpFactor);
            const noisyRadius = baseRadius * (1 + interpolatedNoise * irregularity);

            const x = Math.cos(angle) * noisyRadius;
            const z = Math.sin(angle) * noisyRadius;

            // Calculate height based purely on the base height and Perlin noise
            const noiseVal = this.perlin.noise(x * noiseScale, z * noiseScale, 0);
            const y = baseHeight + noiseVal * noiseStrength;

            noisyContourPoints.push(new THREE.Vector3(x, y, z));
        }

        // --- Smooth the noise on the contour points ---
        const smoothedNoisePoints = this.applySMA(noisyContourPoints, surfaceSmoothing);
        
        // --- Smooth the contour shape ---
        const curve = new THREE.CatmullRomCurve3(smoothedNoisePoints, true);
        const contourPointsForLine = curve.getPoints(numSurfacePoints * 2);
        
        let maxSurfaceY = 0;
        for (const point of contourPointsForLine) {
            maxSurfaceY = Math.max(maxSurfaceY, point.y);
        }


        // --- Generate Small Rock Contour (Outer) ---
        // This contour is generated as a parallel line to the inner contour, ensuring it's always outside.
        const outerRadius = baseRadius + shorelineOffset;
        const numSmallRocks = Math.max(3, Math.round(densityCoefficient * Math.pow(outerRadius, DENSITY_SCALE_POWER)));
        const smallRocksGroup = new THREE.Group();

        const smallRockClones = Array.from({ length: numSmallRocks }, (_, i) => {
            const source = smallRockModels[i % smallRockModels.length];
            return { ...source, model: source.model.clone(true) };
        }).sort(() => Math.random() - 0.5); // Shuffle

        const smallNoise = this.generateNoise(numSmallRocks, Math.random() + Math.PI); // Offset phase for variation
        const OFFSET_IRREGULARITY = 0.5; // How much the shoreline offset varies.

        for (let i = 0; i < numSmallRocks; i++) {
            const data = smallRockClones[i];
            const { model, box } = data;

            // Find a corresponding point on the inner contour to offset from.
            const progress = i / numSmallRocks;
            const innerIndexFloat = progress * numLargeRocks;
            const index1 = Math.floor(innerIndexFloat);
            const index2 = (index1 + 1) % numLargeRocks; // Loop back to the start
            const lerpFactor = innerIndexFloat - index1;

            const data1 = innerContourData[index1];
            const data2 = innerContourData[index2];

            // Interpolate position and normal from the inner contour to create a smooth base.
            const basePosition = data1.position.clone().lerp(data2.position, lerpFactor);
            const baseNormal = data1.normal.clone().lerp(data2.normal, lerpFactor).normalize();

            // Apply a noisy offset to the base shoreline distance.
            const noisyOffset = shorelineOffset * (1 + smallNoise[i] * OFFSET_IRREGULARITY);

            // Calculate the final position by pushing the base point out along its normal.
            const finalPosition = basePosition.clone().add(baseNormal.multiplyScalar(noisyOffset));

            model.position.set(finalPosition.x, -box.min.y, finalPosition.z);
            
            // Orient the rock to be perpendicular to the line from the origin (tangential to the island).
            const finalAngle = Math.atan2(finalPosition.z, finalPosition.x);
            model.rotation.y = -finalAngle + Math.PI / 2;
            
            // Re-apply the shared material to ensure texture updates are reflected
            model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = this.rockMaterial;
                }
            });

            smallRocksGroup.add(model);
        }
        this.group.add(smallRocksGroup);

        // --- Generate Outer Contour Line (Shoreline Base) ---
        const outerContourPoints: THREE.Vector3[] = [];
        const numOuterContourPoints = 128; // Use more points for a smoother line than the rocks themselves.

        for (let i = 0; i < numOuterContourPoints; i++) {
            const progress = i / numOuterContourPoints;

            // Interpolate from inner contour data
            const innerIndexFloat = progress * numLargeRocks;
            const index1 = Math.floor(innerIndexFloat);
            const index2 = (index1 + 1) % numLargeRocks;
            const lerpFactor = innerIndexFloat - index1;

            const data1 = innerContourData[index1];
            const data2 = innerContourData[index2];

            const basePosition = data1.position.clone().lerp(data2.position, lerpFactor);
            const baseNormal = data1.normal.clone().lerp(data2.normal, lerpFactor).normalize();

            // Interpolate from small rock noise data to get consistent irregularity
            const noiseProgress = progress * numSmallRocks;
            const noiseIndex1 = Math.floor(noiseProgress);
            const noiseIndex2 = (noiseIndex1 + 1) % numSmallRocks;
            const noiseLerpFactor = noiseProgress - noiseIndex1;
            const interpolatedNoise = THREE.MathUtils.lerp(smallNoise[noiseIndex1], smallNoise[noiseIndex2], noiseLerpFactor);

            const noisyOffset = shorelineOffset * (1 + interpolatedNoise * OFFSET_IRREGULARITY);

            const finalPosition = basePosition.clone().add(baseNormal.multiplyScalar(noisyOffset));
            outerContourPoints.push(finalPosition);
        }

        const outerCurve = new THREE.CatmullRomCurve3(outerContourPoints, true);
        const outerCurvePoints = outerCurve.getPoints(256); // Even more points for a very smooth line

        const outerContourGeometry = new THREE.BufferGeometry().setFromPoints(outerCurvePoints);
        const outerContourMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        this.outerContourLine = new THREE.LineLoop(outerContourGeometry, outerContourMaterial);
        this.scene.add(this.outerContourLine);

        // --- Generate Island Top Surface ---
        const topContourVertices = contourPointsForLine[contourPointsForLine.length - 1].equals(contourPointsForLine[0])
            ? contourPointsForLine.slice(0, -1)
            : contourPointsForLine;

        if (topContourVertices.length > 2) {
            const vertices: number[] = [];
            const indices: number[] = [];
            
            const numSegments = topContourVertices.length;
            const numRings = 15; // Number of inner rings for a smooth curve

            // Find center point (XZ) of the contour
            const centerXZ = new THREE.Vector2(0, 0);
            topContourVertices.forEach(p => {
                centerXZ.add(new THREE.Vector2(p.x, p.z));
            });
            centerXZ.divideScalar(numSegments);
            
            // Calculate center height from noise to match the rest of the surface
            const centerNoise = this.perlin.noise(centerXZ.x * noiseScale, centerXZ.y * noiseScale, 0);
            const centerHeight = baseHeight + centerNoise * noiseStrength;
            const centerPoint = new THREE.Vector3(centerXZ.x, centerHeight, centerXZ.y);

            // --- Generate Inner Reference Contour ---
            const innerRefPoints: THREE.Vector3[] = [];
            const offsetDistance = foliageBandWidth;

            for (const point of topContourVertices) {
                const pointXZ = new THREE.Vector2(point.x, point.z);
                const direction = pointXZ.clone().sub(centerXZ);
                const originalDistance = direction.length();

                let newDistance = 0;
                if (originalDistance > offsetDistance) {
                    newDistance = originalDistance - offsetDistance;
                }
                direction.setLength(newDistance);
                
                const newPointXZ = centerXZ.clone().add(direction);

                // Interpolate height between center and edge point
                const heightLerpFactor = (originalDistance > 0) ? (newDistance / originalDistance) : 0;
                const newY = THREE.MathUtils.lerp(centerPoint.y, point.y, heightLerpFactor);
                
                innerRefPoints.push(new THREE.Vector3(newPointXZ.x, newY, newPointXZ.y));
            }

            // --- Generate Ground Cover Mesh for Foliage Area ---
            const numContourPoints = topContourVertices.length;
            if (numContourPoints > 2 && innerRefPoints.length === numContourPoints) {
                const groundCoverVertices: number[] = [];
                const groundCoverIndices: number[] = [];
                const yOffset = 0.02; // To prevent z-fighting with the sand mesh

                topContourVertices.forEach(p => groundCoverVertices.push(p.x, p.y + yOffset, p.z));
                innerRefPoints.forEach(p => groundCoverVertices.push(p.x, p.y + yOffset, p.z));

                for (let i = 0; i < numContourPoints; i++) {
                    const next_i = (i + 1) % numContourPoints;

                    const outer_curr = i;
                    const outer_next = next_i;
                    const inner_curr = i + numContourPoints;
                    const inner_next = next_i + numContourPoints;

                    groundCoverIndices.push(outer_curr, inner_curr, outer_next);
                    groundCoverIndices.push(inner_curr, inner_next, outer_next);
                }

                const groundCoverGeometry = new THREE.BufferGeometry();
                groundCoverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(groundCoverVertices, 3));
                groundCoverGeometry.setIndex(groundCoverIndices);
                groundCoverGeometry.computeVertexNormals();

                // Generate UVs for the ground cover mesh using top-down projection
                const TEXTURE_SCALE = 20.0;
                const groundCoverUVs: number[] = [];
                for (let i = 0; i < groundCoverVertices.length; i += 3) {
                    const x = groundCoverVertices[i];
                    const z = groundCoverVertices[i + 2];
                    groundCoverUVs.push(x / TEXTURE_SCALE, z / TEXTURE_SCALE);
                }
                groundCoverGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(groundCoverUVs, 2));
                groundCoverGeometry.computeTangents(); // For normal maps

                this.groundCoverMaterial.side = THREE.DoubleSide;
                this.groundCoverMesh = new THREE.Mesh(groundCoverGeometry, this.groundCoverMaterial);
                this.group.add(this.groundCoverMesh);
            }
            
            const innerRefGeometry = new THREE.BufferGeometry().setFromPoints(innerRefPoints);
            const innerRefMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 }); // Yellow for visibility
            this.innerContourLine = new THREE.LineLoop(innerRefGeometry, innerRefMaterial);
            this.scene.add(this.innerContourLine);


            // Add vertices
            let vertexIndex = 0;
            const gridIndices: number[][] = Array(numRings).fill(0).map(() => Array(numSegments));

            // 0: Center vertex
            vertices.push(centerPoint.x, centerPoint.y, centerPoint.z);
            vertexIndex++;

            // Add interior rings
            for (let r = 0; r < numRings; r++) {
                const ringLerp = (r + 1) / (numRings + 1); // From 1/(N+1) to N/(N+1)
                for (let s = 0; s < numSegments; s++) {
                    const edgePoint = topContourVertices[s];
                    
                    // Interpolate XZ position between center and edge
                    const basePointXZ = new THREE.Vector2(centerPoint.x, centerPoint.z).lerp(new THREE.Vector2(edgePoint.x, edgePoint.z), ringLerp);
                    
                    // Calculate height based on Perlin noise for this point
                    const noiseVal = this.perlin.noise(basePointXZ.x * noiseScale, basePointXZ.y * noiseScale, 0);
                    const pointY = baseHeight + noiseVal * noiseStrength;

                    // To smoothly blend towards the already-smoothed contour, we can lerp our noisy height
                    // with the height interpolated from the (noisy) center to the (smoothed) edge point.
                    const interpolatedContourY = THREE.MathUtils.lerp(centerPoint.y, edgePoint.y, ringLerp);
                    
                    // The 'smoothness' of the blend depends on how close we are to the edge.
                    // We use a stronger blend (powered ringLerp) towards the edge to ensure it matches up well.
                    const blendFactor = Math.pow(ringLerp, 2);
                    const finalY = THREE.MathUtils.lerp(pointY, interpolatedContourY, blendFactor);
                    
                    vertices.push(basePointXZ.x, finalY, basePointXZ.y);
                    gridIndices[r][s] = vertexIndex++;
                }
            }

            // Add contour points themselves as the last ring
            const contourIndices: number[] = [];
            for(const p of topContourVertices) {
                contourIndices.push(vertexIndex++);
                vertices.push(p.x, p.y, p.z);
            }
            
            // Add bottom skirt vertices
            const bottomSkirtStartIndex = vertexIndex;
            for(const p of topContourVertices) {
                vertices.push(p.x, 0, p.z);
            }

            // Triangulate
            // Winding order for all triangles should be counter-clockwise (CCW) when viewed from the 'outside'.
            // For the top surface, this means CCW when viewed from above.
            // Center to first ring
            for (let s = 0; s < numSegments; s++) {
                const p1 = gridIndices[0][s];
                const p2 = gridIndices[0][(s + 1) % numSegments];
                indices.push(0, p1, p2); // CCW: center -> p1 -> p2
            }

            // Between rings
            for (let r = 0; r < numRings - 1; r++) {
                for (let s = 0; s < numSegments; s++) {
                    const next_s = (s + 1) % numSegments;
                    const i_tl = gridIndices[r][s];
                    const i_tr = gridIndices[r][next_s];
                    const i_bl = gridIndices[r + 1][s];
                    const i_br = gridIndices[r + 1][next_s];
                    // Form a quad and split it into two CCW triangles
                    indices.push(i_tl, i_tr, i_br);
                    indices.push(i_tl, i_br, i_bl);
                }
            }

            // Last interior ring to contour
            const lastRingIndex = numRings - 1;
            for (let s = 0; s < numSegments; s++) {
                const next_s = (s + 1) % numSegments;
                const i_tl = gridIndices[lastRingIndex][s];
                const i_tr = gridIndices[lastRingIndex][next_s];
                const i_bl = contourIndices[s];
                const i_br = contourIndices[next_s];
                 // Form a quad and split it into two CCW triangles
                indices.push(i_tl, i_tr, i_br);
                indices.push(i_tl, i_br, i_bl);
            }
            
            // Skirt
            for (let s = 0; s < numSegments; s++) {
                const next_s = (s + 1) % numSegments;
                const i_tl = contourIndices[s];
                const i_tr = contourIndices[next_s];
                const i_bl = bottomSkirtStartIndex + s;
                const i_br = bottomSkirtStartIndex + next_s;
                 // Form a quad and split it into two CCW triangles
                indices.push(i_tl, i_tr, i_br);
                indices.push(i_tl, i_br, i_bl);
            }

            const surfaceGeometry = new THREE.BufferGeometry();
            surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            surfaceGeometry.setIndex(indices);
            surfaceGeometry.computeVertexNormals();

            // --- Generate Blended UVs to prevent texture stretching on steep slopes ---
            const TEXTURE_SCALE = 20.0; // World units per texture tile.
            const uvs: number[] = [];
            const positions = surfaceGeometry.attributes.position.array;
            const normals = surfaceGeometry.attributes.normal.array;

            // Step 1: Default top-down UVs for all vertices up to the skirt's top edge (contour)
            for (let i = 0; i < bottomSkirtStartIndex; i++) {
                const x = positions[i * 3];
                const z = positions[i * 3 + 2];
                uvs.push(x / TEXTURE_SCALE, z / TEXTURE_SCALE);
            }

            // Step 2: Pre-calculate U coordinates for the skirt based on contour edge length.
            // This ensures the texture wraps around the island without horizontal stretching.
            const contourUCoords: number[] = [];
            let accumulatedLength = 0;
            for (let s = 0; s < numSegments; s++) {
                contourUCoords.push(accumulatedLength / TEXTURE_SCALE);
                const p1 = topContourVertices[s];
                const p2 = topContourVertices[(s + 1) % numSegments];
                accumulatedLength += p1.distanceTo(p2);
            }

            // Step 3: Blend UVs for the contour vertices to create a smooth transition
            // from the top surface to the skirt.
            const contourStartIdx = bottomSkirtStartIndex - numSegments;
            for (let s = 0; s < numSegments; s++) {
                const vertexIdx = contourStartIdx + s;
                
                // UVs from top-down projection (already in the array)
                const uTop = uvs[vertexIdx * 2];
                const vTop = uvs[vertexIdx * 2 + 1];

                // UVs from side-on projection
                const y = positions[vertexIdx * 3 + 1];
                const uSide = contourUCoords[s];
                const vSide = y / TEXTURE_SCALE;

                // Blend based on the vertex normal.
                // Normals pointing up get top-down UVs, normals pointing sideways get side-on UVs.
                const normalY = normals[vertexIdx * 3 + 1];
                const topDownWeight = Math.pow(Math.abs(normalY), 4.0);

                const finalU = uTop * topDownWeight + uSide * (1.0 - topDownWeight);
                const finalV = vTop * topDownWeight + vSide * (1.0 - topDownWeight);
                
                uvs[vertexIdx * 2] = finalU;
                uvs[vertexIdx * 2 + 1] = finalV;
            }

            // Step 4: Add pure side-on UVs for the bottom vertices of the skirt.
            for (let s = 0; s < numSegments; s++) {
                const vertexIdx = bottomSkirtStartIndex + s;
                const y = positions[vertexIdx * 3 + 1];
                
                const uSide = contourUCoords[s];
                const vSide = y / TEXTURE_SCALE;

                uvs.push(uSide, vSide);
            }

            surfaceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            surfaceGeometry.computeTangents(); // Recalculate tangents for correct normal mapping.

            this.islandSurface = new THREE.Mesh(surfaceGeometry, this.sandMaterial);
            this.group.add(this.islandSurface);
            this.generateFoliage(topContourVertices, innerRefPoints, foliageBandWidth);
        }

        // --- Finalize Scene ---
        const geometry = new THREE.BufferGeometry().setFromPoints(contourPointsForLine);
        const material = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
        this.contourLine = new THREE.LineLoop(geometry, material);
        // The Y position is now baked into the geometry points.
        this.scene.add(this.contourLine);
        
        this.controls.target.set(0, maxSurfaceY / 2, 0);

        // Calculate camera distance to frame the island
        const tanFovY2 = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        const tanFovX2 = tanFovY2 * this.camera.aspect;

        // The island's approximate total diameter
        const islandDiameter = (baseRadius + shorelineOffset) * 2;

        // Distance required to fit width and depth in view
        const distForWidth = islandDiameter / (2 * tanFovX2);
        const distForDepth = islandDiameter / (2 * tanFovY2);

        const cameraZ = Math.max(distForWidth, distForDepth) * 1.4; // Add 40% padding

        this.camera.position.set(0, cameraZ * 0.5, cameraZ);
        this.controls.update();

    } catch(e) {
        console.error("Failed to generate island:", e);
        alert("An error occurred during generation. Please check the console.");
    } finally {
        this.showLoading(false);
        this.generateButton.disabled = this.rockModels.length === 0;
    }
  }

  private isPointInPolygon(point: THREE.Vector2, polygon: THREE.Vector3[]): boolean {
    let isInside = false;
    const x = point.x, y = point.y;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;

        const intersect = ((zi > y) !== (zj > y))
            && (x < (xj - xi) * (y - zi) / (zj - zi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
  }

  private generateFoliage(outerContour: THREE.Vector3[], innerContour: THREE.Vector3[], foliageBandWidth: number) {
    if (!this.islandSurface) {
        return;
    }

    this.showLoading(true, "Placing foliage...");
    
    setTimeout(() => {
        try {
            this.foliageGroup.clear();

            const geometry = this.islandSurface.geometry;
            const positions = geometry.attributes.position;
            const indices = geometry.index.array;
            
            const maxSlopeDegrees = parseFloat(this.foliageMaxSlopeInput.value);
            const slopeThreshold = Math.cos(THREE.MathUtils.degToRad(maxSlopeDegrees));

            const debugStats = {
                totalFaces: indices.length / 3,
                rejectedSlope: 0,
                rejectedSubmerged: 0,
                rejectedOutsideBand: 0,
                rejectedInsideBand: 0,
                accepted: 0
            };
            
            const validFaces: {
                vA: THREE.Vector3,
                vB: THREE.Vector3,
                vC: THREE.Vector3,
                normal: THREE.Vector3,
                area: number
            }[] = [];
            let totalArea = 0;

            const vA = new THREE.Vector3();
            const vB = new THREE.Vector3();
            const vC = new THREE.Vector3();
            const triangle = new THREE.Triangle();
            const centroid = new THREE.Vector3();
            const centroid2D = new THREE.Vector2();
            const faceNormal = new THREE.Vector3();

            for (let i = 0; i < indices.length; i += 3) {
                const iA = indices[i];
                const iB = indices[i+1];
                const iC = indices[i+2];

                vA.fromBufferAttribute(positions, iA);
                vB.fromBufferAttribute(positions, iB);
                vC.fromBufferAttribute(positions, iC);
                
                THREE.Triangle.getNormal(vA, vB, vC, faceNormal);
                if (faceNormal.y < slopeThreshold) {
                    debugStats.rejectedSlope++;
                    continue; // Avoid steep slopes
                }
                if (vA.y <= 0 && vB.y <= 0 && vC.y <= 0) {
                    debugStats.rejectedSubmerged++;
                    continue; // Avoid skirt
                }

                centroid.copy(vA).add(vB).add(vC).divideScalar(3);
                centroid2D.set(centroid.x, centroid.z);
                
                const isInsideOuter = this.isPointInPolygon(centroid2D, outerContour);
                if (!isInsideOuter) {
                    debugStats.rejectedOutsideBand++;
                    continue;
                }
                
                const isInsideInner = this.isPointInPolygon(centroid2D, innerContour);
                if (isInsideInner) {
                    debugStats.rejectedInsideBand++;
                    continue;
                }
                
                debugStats.accepted++;
                const area = triangle.set(vA, vB, vC).getArea();
                validFaces.push({
                    vA: vA.clone(), vB: vB.clone(), vC: vC.clone(),
                    normal: faceNormal.clone(), area
                });
                totalArea += area;
            }

            const grassDensity = parseFloat(this.grassDensityInput.value);
            let numInstances = Math.floor(totalArea / 100 * grassDensity);
            
            const maxFoliageCountVal = this.maxFoliageCountInput.value;
            if (maxFoliageCountVal) {
                const maxCount = parseInt(maxFoliageCountVal, 10);
                if (!isNaN(maxCount) && maxCount >= 0) {
                    numInstances = Math.min(numInstances, maxCount);
                }
            }

            if (numInstances === 0 || validFaces.length === 0) {
                if(this.foliageCoordinatesList) {
                    const message = `No foliage generated.
Reason: No valid surface area found for placement.

Current Settings:
- Max Slope Allowed:  ${maxSlopeDegrees.toFixed(1).padStart(7)}°
- Foliage Band Width: ${foliageBandWidth.toFixed(1).padStart(7)} units

Debug Stats:
- Total surface faces:    ${String(debugStats.totalFaces).padStart(7)}
- Rejected (too steep):   ${String(debugStats.rejectedSlope).padStart(7)} (Faces > ${maxSlopeDegrees}° slope)
- Rejected (underwater):  ${String(debugStats.rejectedSubmerged).padStart(7)}
- Rejected (outside band):${String(debugStats.rejectedOutsideBand).padStart(7)}
- Rejected (inside band): ${String(debugStats.rejectedInsideBand).padStart(7)}
- Accepted faces:         ${String(debugStats.accepted).padStart(7)}
- Calculated valid area:  ${totalArea.toFixed(2).padStart(7)} units²

Suggestion: Try increasing "Max Foliage Slope", or adjusting "Island Radius" and "Foliage Band Width".`;
                    this.foliageCoordinatesList.textContent = message;
                }
                this.showLoading(false);
                return;
            }

            const cdf: { faceIndex: number, cumulativeArea: number }[] = [];
            let cumulativeArea = 0;
            for(let i = 0; i < validFaces.length; i++) {
                cumulativeArea += validFaces[i].area;
                cdf.push({faceIndex: i, cumulativeArea});
            }

            const up = new THREE.Vector3(0, 1, 0);
            const FOLIAGE_Y_OFFSET = 0.02; // To sit on top of the visualization mesh
            const foliageDebugPoints: THREE.Vector3[] = [];
            const foliagePivotPoints: THREE.Vector3[] = []; // For the list
            const baseFoliageScale = parseFloat(this.foliageScaleInput.value);

            for (let i = 0; i < numInstances; i++) {
                const randomArea = Math.random() * totalArea;
                const foundCdf = cdf.find(item => item.cumulativeArea >= randomArea);
                if (!foundCdf) continue;

                const faceData = validFaces[foundCdf.faceIndex];
                
                let u = Math.random();
                let v = Math.random();
                if (u + v > 1) {
                    u = 1 - u;
                    v = 1 - v;
                }
                const w = 1 - u - v;

                const point = new THREE.Vector3();
                point.addScaledVector(faceData.vA, u);
                point.addScaledVector(faceData.vB, v);
                point.addScaledVector(faceData.vC, w);
                
                foliagePivotPoints.push(point.clone()); // Store the actual pivot point

                // Calculate the final 3D position for the debug point, including the vertical offset.
                const debugPointPosition = point.clone();
                debugPointPosition.y += FOLIAGE_Y_OFFSET + 0.01;
                foliageDebugPoints.push(debugPointPosition);


                if (this.grassModel) {
                    const grass = this.grassModel.clone();
    
                    // Calculate final 3D position for the grass model.
                    const grassPosition = point.clone();
                    grassPosition.y += FOLIAGE_Y_OFFSET;
                    grass.position.copy(grassPosition);
    
                    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, faceData.normal);
                    grass.quaternion.copy(quaternion);
                    
                    grass.rotateY(Math.random() * Math.PI * 2);

                    const randomVariation = THREE.MathUtils.randFloat(0.8, 1.2);
                    const finalScale = baseFoliageScale * randomVariation;
                    grass.scale.set(finalScale, finalScale, finalScale);
    
                    this.foliageGroup.add(grass);
                }
            }
            
            if (foliageDebugPoints.length > 0) {
                const pointsGeometry = new THREE.BufferGeometry().setFromPoints(foliageDebugPoints);
                const pointsMaterial = new THREE.PointsMaterial({
                    color: 0xff0000,
                    size: 0.15,
                    sizeAttenuation: true,
                });
                const redDots = new THREE.Points(pointsGeometry, pointsMaterial);
                this.foliageGroup.add(redDots);

                if (this.foliageCoordinatesList) {
                    // Use the original pivot points for the list, not the offset debug points
                    const coordinatesText = foliagePivotPoints.map((p, index) => {
                        const x = p.x.toFixed(2);
                        const y = p.y.toFixed(2);
                        const z = p.z.toFixed(2);
                        return `${(index + 1).toString().padStart(4, ' ')}: (${x.padStart(7, ' ')}, ${y.padStart(7, ' ')}, ${z.padStart(7, ' ')})`;
                    }).join('\n');
                    this.foliageCoordinatesList.textContent = coordinatesText;
                }
            } else {
                if (this.foliageCoordinatesList) {
                    this.foliageCoordinatesList.textContent = 'No foliage points generated.';
                }
            }

        } catch (e) {
            console.error("Failed to place foliage:", e);
            alert("An error occurred during foliage placement. Please check console.");
            if (this.foliageCoordinatesList) {
                this.foliageCoordinatesList.textContent = 'Error generating foliage coordinates.';
            }
        } finally {
            this.showLoading(false);
        }
    }, 20);
  }

  private showLoading(isLoading: boolean, message: string = "Loading...") {
    this.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    if(isLoading) {
      const loadingText = this.loadingOverlay.querySelector('p');
      if (loadingText) {
        loadingText.textContent = message;
      }
    }
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new IslandGeneratorApp();