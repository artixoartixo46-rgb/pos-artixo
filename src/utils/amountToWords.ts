// Convert numeric amount to words (Sri Lankan English format)
const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

const scales = ['', 'Thousand', 'Lakh', 'Crore'];

function convertHundreds(num: number): string {
  let result = '';
  
  if (num >= 100) {
    result += ones[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  
  if (num >= 20) {
    result += tens[Math.floor(num / 10)] + ' ';
    num %= 10;
  }
  
  if (num > 0) {
    result += ones[num] + ' ';
  }
  
  return result.trim();
}

export function amountToWords(amount: number): string {
  if (amount === 0) return 'Zero Rupees Only';
  
  const rupees = Math.floor(amount);
  const cents = Math.round((amount - rupees) * 100);
  
  let words = '';
  
  if (rupees === 0) {
    words = 'Zero';
  } else {
    // Sri Lankan numbering system: ones, thousands, lakhs (100,000), crores (10,000,000)
    const crores = Math.floor(rupees / 10000000);
    const lakhs = Math.floor((rupees % 10000000) / 100000);
    const thousands = Math.floor((rupees % 100000) / 1000);
    const remainder = rupees % 1000;
    
    if (crores > 0) {
      words += convertHundreds(crores) + ' Crore ';
    }
    
    if (lakhs > 0) {
      words += convertHundreds(lakhs) + ' Lakh ';
    }
    
    if (thousands > 0) {
      words += convertHundreds(thousands) + ' Thousand ';
    }
    
    if (remainder > 0) {
      words += convertHundreds(remainder);
    }
  }
  
  words = words.trim() + ' Rupees';
  
  if (cents > 0) {
    words += ' and ' + convertHundreds(cents) + ' Cents';
  }
  
  words += ' Only';
  
  return words;
}

export function formatChequeDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  return `${day}/${month}/${year}`;
}
