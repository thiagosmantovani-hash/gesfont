// Assinatura ad-hoc do GESFONT.app no Mac (sem certificado da Apple).
// Sem ela, Macs com chip Apple mostram o app baixado como "danificado".
// Com ela, o macOS mostra só o aviso de desenvolvedor não verificado, liberado uma vez em
// Ajustes do Sistema > Privacidade e Segurança > Abrir mesmo assim.
// Depois deste passo, as travas de segurança do Electron (fuses) são gravadas e o app é assinado
// ad-hoc de novo por inteiro (resetAdHocDarwinSignature), então a assinatura final vale para o app pronto.
// Quando houver certificado Developer ID, o electron-builder assina de verdade e este passo é pulado.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const identity = context.packager.platformSpecificBuildOptions.identity;
  if (identity !== null) return; // há certificado configurado: assinatura normal
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • assinatura ad-hoc  ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
