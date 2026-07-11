import { updateLottoData } from './_shared/update-core.mjs';

export default async function handler() {
  try {
    const result = await updateLottoData();
    console.log('Scheduled lotto update result:', JSON.stringify(result));
  } catch (error) {
    console.error('Scheduled lotto update failed:', error);
    throw error;
  }
}
