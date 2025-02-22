import TestUtils from '../../../../tests/TestUtils';
import { Compiler, MacroMatch, SelectorProperties } from '../../src';

const testName = 'variables-and-helpers';
const testUtils = new TestUtils('stylify', testName);
const inputIndex = testUtils.getHtmlInputFile();

const compiler = new Compiler({
	dev: true,
	replaceVariablesByCssVariables: true,
	screens: {
		md: '(min-width: 640px)',
		lg: () => '(min-width: 1024px)',
		dark: '(prefers-color-scheme: dark)',
		'minw\\w+': (screen: string): string => `(min-width: ${screen.replace('minw', '')})`,
	},
	variables: {
		blue: 'darkblue',
		border: 'border 1px solid $blue',
		bg: 'white',
		color: 'black',
		fontSize: '12px',
		dark: {
			bg: 'black',
			color: 'white'
		},
		minw450px: {
			fontSize: '18px'
		},
		lg: {
			fontSize: '24px'
		}
	},
	helpers: {
		textPropertyType(value: string): string {
			if (value === 'bold') {
				return 'font-weight';
			} else if (value === 'italic') {
				return 'font-style'
			}
			return value;
		},
		shortcut(value: string): string {
			const shortcuts = {
				'bgc': 'background-color',
				'fs': 'font-size',
				'clr': 'color',
				'zi': 'z-index'
			};

			return value in shortcuts ? shortcuts[value] : value;
		}
	},
	macros: {
		'text:(\\S+)': function (m: MacroMatch, p: SelectorProperties): void {
			const property = this.helpers.textPropertyType(m.getCapture(0));
			p.add(property, m.getCapture(0));
		},
		'(fs|bgc|zi|clr):(\\S+)': function (m: MacroMatch, p: SelectorProperties): void {
			const property = this.helpers.shortcut(m.getCapture(0));
			p.add(property, m.getCapture(1));
		},
		'fix:(\\S+)': function (m: MacroMatch, p: SelectorProperties): void {
			p.addMultiple({
				position: 'fixed',
				top: m.getCapture(0),
				left: m.getCapture(0)
			});
		}
	}
});

let compilationResult = compiler.compile(inputIndex);

test('Variables and helpers', (): void => {
	testUtils.testCssFileToBe(compilationResult.generateCss());
});
