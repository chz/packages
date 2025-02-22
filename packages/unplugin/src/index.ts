import { BundleConfigInterface, BundlerConfigInterface, Bundler, BundlesBuildCacheInterface } from '@stylify/bundler';
import { CompilationResult, Compiler, ComponentsInterface } from '@stylify/stylify';
import { createUnplugin } from 'unplugin';

export interface UnpluginConfigInterface {
	bundles: BundleConfigInterface[];
	dev?: boolean;
	bundler?: BundlerConfigInterface;
	transformIncludeFilter?: (id: string) => boolean;
	extend?: Partial<Omit<UnpluginConfigInterface, 'extend'>>;
}

export const defineConfig = (config: UnpluginConfigInterface): UnpluginConfigInterface => config;

const defaultAllowedFileTypes = [
	// Html
	'html', 'htm', 'xml', 'xhtml', 'xht',
	// Javascript
	'vue', 'jsx', 'tsx', 'js', 'cjs', 'mjs', 'ts', 'svelte', 'astro',
	// PHP
	'php', 'phtml', 'twig', 'latte', 'tpl', 'pug', 'haml',
	// Python
	'py',
	// Java
	'java',
	// Golang
	'go',
	// Rust
	'rs',
	// C#, .NET and similar
	'cs', 'asp', 'aspx',
	// Other
	'json', 'md', 'txt'
];

const defaultIgnoredDirectories = [
	'node_modules',
	'vendor',
	'tmp',
	'log',
	'cache',
	'\\.devcontainer',
	'\\.github',
	'\\.git'
];

const defaultAllowedTypesRegExp = new RegExp(`\\.(?:${defaultAllowedFileTypes.join('|')})\\b`);
const defaultIgnoredDirectoriesRegExp = new RegExp(`/${defaultIgnoredDirectories.join('|')}/`);

export const unplugin = createUnplugin((config: UnpluginConfigInterface) => {

	const pluginName = 'stylify';

	let pluginConfig: UnpluginConfigInterface = defineConfig({
		dev: null,
		bundles: [],
		bundler: {
			dev: null,
			compiler: {}
		},
		transformIncludeFilter: null
	});

	const mergeObject = (...objects): any => {
		const newObject = {};

		for (const processedObject of objects) {
			for (const processedObjectKey in processedObject) {
				const newValue = processedObject[processedObjectKey];

				if (processedObjectKey in newObject) {
					if (Array.isArray(newValue)) {
						newObject[processedObjectKey] = [
							...newObject[processedObjectKey],
							...newValue
						];
						continue;

					} else if (typeof newValue === 'object' && newValue !== null) {
						newObject[processedObjectKey] = mergeObject(newObject[processedObjectKey], newValue);
						continue;
					}
				}

				newObject[processedObjectKey] = newValue;
			}
		}

		return newObject;
	};

	const getBundler = (): Bundler => {
		if (pluginConfig.dev === null && typeof process.env['NODE_ENV'] !== 'undefined') {
			pluginConfig.dev = process.env['NODE_ENV'] !== 'test';
			pluginConfig.bundler.compiler.mangleSelectors = !pluginConfig.dev;
		}

		if (pluginConfig.dev || !bundler) {
			const bundlerConfig = {
				...pluginConfig.bundler,
				...{ bundles: pluginConfig.bundles}
			};
			bundler = new Bundler(bundlerConfig);
		}

		return bundler;
	};

	if ('extend' in config) {
		pluginConfig = mergeObject(pluginConfig, config.extend);
		delete config.extend;
	}

	pluginConfig = {...pluginConfig, ...config};

	let bundler: Bundler = null;

	const runBundlerOrWait = async () => {
		if (bundler) {
			return bundler.waitOnBundlesProcessed();
		}

		const localBundler = getBundler();

		await Promise.all([
			localBundler.bundle(),
			localBundler.waitOnBundlesProcessed()
		]);
	};

	return {
		name: pluginName,
		transformInclude(id) {
			return typeof pluginConfig.transformIncludeFilter === 'function'
				? pluginConfig.transformIncludeFilter(id)
				: defaultAllowedTypesRegExp.test(id) && !defaultIgnoredDirectoriesRegExp.test(id);
		},
		async transform(code): Promise<string> {
			const bundler = getBundler();
			await bundler.bundle();
			await bundler.waitOnBundlesProcessed();

			if (pluginConfig.dev) {
				return code;
			}

			const selectors = {};
			const components: Record<string, ComponentsInterface> = {};

			const bundlesBuildCache: BundlesBuildCacheInterface[] = Object.values(bundler.bundlesBuildCache);
			for (const bundleBuildCache of bundlesBuildCache) {
				for (const selector in bundleBuildCache.compilationResult.selectorsList) {
					if (!(selector in selectors)) {
						selectors[selector] = {selector: selector};
					}
				}

				for (const component in bundleBuildCache.compiler.components) {
					if (!(component in components)) {
						components[component] = bundleBuildCache.compiler.components[component];
					}
				}
			}

			return new Compiler(bundler.compilerConfig).rewriteSelectors(
				code,
				new CompilationResult({
					selectorsList: selectors,
					componentsList: Object.keys(components)
				})
			);
		},
		esbuild: {
			async setup() {
				await runBundlerOrWait();
			}
		},
		rollup: {
			async options(): Promise<void> {
				if (pluginConfig.dev !== null) {
					pluginConfig.bundler.compiler.mangleSelectors = !pluginConfig.dev;
				}

				pluginConfig.bundler.watchFiles = process.env.ROLLUP_WATCH === 'true';
				return runBundlerOrWait();
			}
		},
		vite: {
			async configResolved(config): Promise<void> {
				if (pluginConfig.dev === null) {
					pluginConfig.dev = !config.isProduction;
					pluginConfig.bundler.compiler.mangleSelectors = !pluginConfig.dev;
					pluginConfig.bundler.watchFiles = pluginConfig.dev;
				} else if (pluginConfig.dev === true) {
					pluginConfig.bundler.watchFiles = true;
				}

				return runBundlerOrWait();
			}
		},
		webpack(compiler) {
			if (pluginConfig.dev === null && compiler.options.mode !== 'none') {
				pluginConfig.dev = compiler.options.mode === 'development';
			}

			pluginConfig.bundler.compiler.mangleSelectors = !pluginConfig.dev && !compiler.options.watch;
			pluginConfig.bundler.watchFiles = compiler.options.watch;

			compiler.hooks.beforeRun.tapPromise(pluginName, (): Promise<void> => {
				return runBundlerOrWait();
			});

			compiler.hooks.watchRun.tapPromise(pluginName, (): Promise<void> => {
				return runBundlerOrWait();
			});
		}
	};
});

export const vitePlugin = unplugin.vite;
export const rollupPlugin = unplugin.rollup;
export const webpackPlugin = unplugin.webpack;
export const esbuildPlugin = unplugin.esbuild;
