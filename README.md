# morgan-stanley-pdf-to-csv
Converts exported PDFs from Morgan Stanley At Work to CSV format

*IMPORTANT:* This code is provided with absolutely no guarantees whatsoever of correctness.
Use at your own risk, I am not responsible for any miscalculations, accounting errors or other
problems arising from this code or its usage.


Usage instructions
------------------

Getting the input PDF:
  - Go to https://shareworks.solium.com/solium/servlet/ui/activity/reports/statement
  - Set the settings according to this screenshot:
    - <img width="1151" height="719" alt="Screenshot 2026-02-08 at 10 35 25" src="https://github.com/user-attachments/assets/5cdab01a-0f5a-4429-bc86-41c00bd53275" />
    - Choose "All Available History"
    - Choose "PDF"
    - Choose "Full" rather than Simplified
    - Choose "Original" rather than Adjusted
  - Download PDF and put it somewhere

Running the script:
```bash
brew install poppler   # installs the pdftotext library
npm install
npx ts-node parse-statement.ts statement.pdf output.csv
```
