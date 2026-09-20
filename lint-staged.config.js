export default {
  '*.ts': ['oxlint --type-aware', 'prettier --write'],
  '*.{json,md}': ['prettier --write'],
};
